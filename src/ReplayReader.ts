/* eslint-disable class-methods-use-this */
import { CipherKey } from 'crypto';
import { promises as fs } from 'fs';
import BinaryReader from './BinaryReader';
import { queryAccounts } from './Http';
import {
  ReaderConfig,
  Parseable,
  ReplayEncryption,
  ReplayMeta,
  ReplayHeader,
  ReplayPlayer,
  ReplayElimination,
  ReplayMatchStats,
  ReplayTeamMatchStats,
  Location,
  AdditionGfp,
  SafeZone,
  PlayerPositions,
  FLocalFileReplayCustomVersion,
} from './structs';

const halfMapSize = 131328;

class ReplayReader {
  private replay: Buffer;
  private reader: BinaryReader;
  private encryption: ReplayEncryption;
  private meta?: ReplayMeta;
  private header?: ReplayHeader;
  private eliminations: ReplayElimination[];
  private matchStats?: ReplayMatchStats;
  private teamMatchStats?: ReplayTeamMatchStats;
  /** contains a list of additional game files that are required to watch the replay */
  private additionGfps: AdditionGfp[];
  private safeZones: SafeZone[] = [];
  private playerPositions: PlayerPositions = {};
  private constructor(replay: Buffer) {
    this.replay = replay;
    this.reader = new BinaryReader(this.replay);

    this.encryption = {
      isEncrypted: undefined,
      encryptionKey: undefined,
    };

    this.meta = undefined;
    this.header = undefined;
    this.eliminations = [];
    this.matchStats = undefined;
    this.teamMatchStats = undefined;
    this.additionGfps = [];
  }

  private parseMeta() {
    const magic = this.reader.readUInt32();
    const fileVersion = this.reader.readUInt32();
    
    if(fileVersion > FLocalFileReplayCustomVersion.LatestVersion) {
      process.emitWarning(`The replay file you provided is not fully supported and may cause errors. Please report any issues you encounter.`);
    }
    
    const lengthInMs = this.reader.readUInt32();
    const networkVersion = this.reader.readUInt32();
    const changelist = this.reader.readUInt32();

    if(fileVersion >= FLocalFileReplayCustomVersion.CustomVersions) {
      // With fileVersion 7 Epic has added some extra bytes, we need to skip them atm
      this.reader.goto(44);
    }
    
    const name = this.reader.readString();
    const isLive = this.reader.readBool();

    let timestamp;
    if (fileVersion >= 3) {
      const timeStampUint64 = this.reader.readUInt64();
      timestamp = new Date(parseInt(((timeStampUint64 - BigInt('621355968000000000')) / BigInt('10000')).toString(), 10));
    }

    let isCompressed;
    if (fileVersion >= 2) isCompressed = this.reader.readBool();

    let isEncrypted = false;
    let encryptionKey = Buffer.from([]);
    if (fileVersion >= 6) {
      isEncrypted = this.reader.readBool();
      const encryptionKeyLength = this.reader.readUInt32();
      encryptionKey = this.reader.readBytes(encryptionKeyLength);
    }

    if (!isLive && isEncrypted && encryptionKey.length === 0) throw new Error('Cannot read encrypted replay without encryption key');

    if (isLive && isEncrypted) throw new Error('Cannot read encrypted live replay');

    if (isEncrypted) {
      this.encryption.isEncrypted = true;
      this.encryption.encryptionKey = encryptionKey;
    }

    const meta = {
      magic,
      fileVersion,
      lengthInMs,
      networkVersion,
      changelist,
      name,
      isLive,
      timestamp,
      isCompressed,
    };

    this.meta = meta;
    return meta;
  }

  private parseChunks(meta: ReplayMeta) {
    const chunksStartOffset = this.reader.offset;
    while (this.reader.buffer.byteLength > this.reader.offset) {
      const chunkType = this.reader.readUInt32();
      const chunkSize = this.reader.readInt32();
      const startOffset = this.reader.offset;

      switch (chunkType) {
        case 0:
          if (!this.header) {
            this.parseHeader(meta);
            this.reader.goto(chunksStartOffset);
          }
          break;
        case 1: break;
        case 2: break;
        case 3: if (this.header) this.parseEvent(); break;
      }

      this.reader.goto(startOffset + chunkSize);
    }
  }

  private parseHeader(meta: ReplayMeta) {
    const magic = this.reader.readUInt32();
    const networkVersion = this.reader.readUInt32();
    const networkChecksum = this.reader.readUInt32();
    const engineNetworkVersion = this.reader.readUInt32();
    const gameNetworkProtocol = this.reader.readUInt32();

    let id;
    if (networkVersion > 12) id = this.reader.readId();

    this.reader.skip(4);
    const patch = this.reader.readUInt16();
    const changelist = this.reader.readUInt32();

    if(meta.fileVersion >= FLocalFileReplayCustomVersion.CustomVersions) {
      // With fileVersion 7 Epic has added some extra bytes, we need to skip them atm
      this.reader.skip(84);
    }
    
    const branch = this.reader.readString();

    let fileVersionUE4;
    let fileVersionUE5;
    let packageVersionLicenseeUe;

    if (networkVersion >= 18) {
      fileVersionUE4 = this.reader.readUInt32();
      fileVersionUE5 = this.reader.readUInt32();
      packageVersionLicenseeUe = this.reader.readUInt32();
    }

    const levelNamesAndTimes = this.reader.readObjectArray((r) => r.readString(), (r) => r.readUInt32());
    const flags = this.reader.readUInt32();
    const gameSpecificData = this.reader.readArray((r) => r.readString());

    const major = parseInt((branch.match(/(?<=-)\d*/) as any[])[0], 10);
    const minor = parseInt((branch.match(/\d*$/) as any[])[0], 10);

    this.header = {
      magic,
      networkVersion,
      networkChecksum,
      engineNetworkVersion,
      gameNetworkProtocol,
      id,
      version: {
        branch,
        major,
        minor,
        changelist,
        patch,
      },
      fileVersionUE4,
      fileVersionUE5,
      packageVersionLicenseeUe,
      levelNamesAndTimes,
      flags,
      gameSpecificData,
    };
  }

  private parseEvent() {
    if (!this.reader) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');
    if (!this.header) throw new Error('Replay is missing a header chunk');

    this.reader.readString(); // eventId
    const group = this.reader.readString();
    const metadata = this.reader.readString();
    const startTime = this.reader.readUInt32();
    this.reader.readUInt32(); // endTime
    const size = this.reader.readUInt32();

    const decryptedEventBuffer = this.encryption.encryptionKey
      ? this.reader.decryptBuffer(size, this.encryption.encryptionKey as any as CipherKey) : this.reader.readBytes(size);

    const eventReader = new BinaryReader(decryptedEventBuffer);

    if (group === 'playerElim') this.parsePlayerElim(eventReader, startTime);
    else if (metadata === 'AthenaMatchStats') this.parseMatchStats(eventReader);
    else if (metadata === 'AthenaMatchTeamStats') this.parseTeamMatchStats(eventReader);
    else if (group === 'AdditionGFPEventGroup') this.parseAdditionGfp(eventReader);
    else if (group === 'ZoneUpdate') this.parseZoneUpdate(eventReader);
    else if (group === 'CharacterSample') this.parseCharacterSampleMeta(eventReader);
  }

  private parsePlayerElim(reader: BinaryReader, timestamp: number) {
    if (!this.reader || !this.header) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');

    const version = reader.readInt32();
    let eliminated: ReplayPlayer;
    let eliminator: ReplayPlayer;

    if (version >= 3) {
      reader.skip(1);
      let eliminatedPos;
      let eliminatorPos;

      if (version >= 6) {
        if (this.header.engineNetworkVersion < 23) {
          eliminatedPos = <Location>{
            rotation: reader.readVector4f(),
            position: reader.readVector3f(),
            scale: reader.readVector3f(),
          };
        } else {
          eliminatedPos = <Location>{
            rotation: reader.readVector4d(),
            position: reader.readVector3d(),
            scale: reader.readVector3d(),
          };
        }
      }

      if (this.header.engineNetworkVersion < 23) {
        eliminatorPos = <Location>{
          rotation: reader.readVector4f(),
          position: reader.readVector3f(),
          scale: reader.readVector3f(),
        };
      } else {
        eliminatorPos = <Location>{
          rotation: reader.readVector4d(),
          position: reader.readVector3d(),
          scale: reader.readVector3d(),
        };
      }

      if (this.header.version.major >= 9) {
        eliminated = this.parsePlayer(reader);
        eliminator = this.parsePlayer(reader);

        eliminated.location = eliminatedPos;
        eliminator.location = eliminatorPos;
      } else {
        eliminated = {
          name: reader.readString(),
          location: eliminatedPos,
          isBot: false,
        };

        eliminator = {
          name: reader.readString(),
          location: eliminatorPos,
          isBot: false,
        };
      }
    } else {
      if (this.header.version.major <= 4 && this.header.version.minor < 2) reader.skip(8);
      else if (this.header.version.major === 4 && this.header.version.minor <= 2) reader.skip(36);
      else reader.skip(41);

      eliminated = { name: undefined, id: reader.readString(), isBot: false };
      eliminator = { name: undefined, id: reader.readString(), isBot: false };
    }

    const gunType = reader.readByte().toString('hex');
    const knocked = reader.readBool();

    this.eliminations.push({
      eliminated,
      eliminator,
      gunType,
      knocked,
      timestamp,
    });
  }

  private parsePlayer(reader: BinaryReader) {
    const playerType = reader.readByte().toString('hex');

    const player: ReplayPlayer = { name: undefined, id: undefined, isBot: true };
    if (playerType === '03') {
      player.name = 'Bot';
    } else if (playerType === '10') {
      player.name = reader.readString();
    } else {
      reader.skip(1);
      player.id = reader.readId();
      player.isBot = false;
    }

    return player;
  }

  private parseMatchStats(reader: BinaryReader) {
    reader.skip(4);
    const accuracy = reader.readFloat32();
    const assists = reader.readUInt32();
    const eliminations = reader.readUInt32();
    const weaponDamage = reader.readUInt32();
    const otherDamage = reader.readUInt32();
    const revives = reader.readUInt32();
    const damageTaken = reader.readUInt32();
    const damageToStructures = reader.readUInt32();
    const materialsGathered = reader.readUInt32();
    const materialsUsed = reader.readUInt32();
    const totalTraveled = Math.round(reader.readUInt32() / 100000);

    this.matchStats = {
      accuracy,
      assists,
      eliminations,
      weaponDamage,
      otherDamage,
      revives,
      damageTaken,
      damageToStructures,
      materialsGathered,
      materialsUsed,
      totalTraveled,
    };
  }

  private parseTeamMatchStats(reader: BinaryReader) {
    reader.skip(4);
    const position = reader.readUInt32();
    const totalPlayers = reader.readUInt32();

    this.teamMatchStats = {
      position,
      totalPlayers,
    };
  }

  private parseAdditionGfp(reader: BinaryReader) {
    if (!this.reader || !this.header) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');

    const version = reader.readInt32();
    const count = reader.readUInt32();

    for (let i = 0; i < count; i += 1) {
      const moduleId = reader.readString();

      if (version < 2) {
        this.additionGfps.push({
          moduleId,
          moduleVersion: reader.readInt32(),
        });
      } else {
        this.additionGfps.push({
          moduleId,
          artifactId: reader.readString(),
        });
      }
    }
  }

  private parseZoneUpdate(reader: BinaryReader) {
    if (!this.reader || !this.header) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');

    reader.skip(4); // version

    this.safeZones.push({
      ...(this.header.engineNetworkVersion < 23 ? reader.readVector3f() : reader.readVector3d()),
      radius: reader.readFloat32(),
    });
  }

  private parseCharacterSampleMeta(reader: BinaryReader) {
    if (!this.reader || !this.header) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');

    reader.skip(4); // version

    const playerCount = reader.readUInt32();

    for (let i = 0; i < playerCount; i += 1) {
      const id = reader.readString();

      let player = this.playerPositions[id];

      if (!player) {
        player = {};

        this.playerPositions[id] = player;
      }

      const sampleCount = reader.readUInt32();

      for (let j = 0; j < sampleCount; j += 1) {
        const location = {
          ...this.readPosition(reader),
          movementStyle: reader.readByte().toString('hex'),
        };

        const time = reader.readInt16();

        player[time] = location;
      }
    }
  }

  private readPositionCompat(reader: BinaryReader) {
    if (!this.reader || !this.header) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');

    const size = reader.readInt32();
    const x = reader.readInt32();
    const y = reader.readInt32();
    const z = reader.readInt32();

    return {
      x: x - (halfMapSize >> (16 - size)),
      y: y - (halfMapSize >> (16 - size)),
      z: z - (halfMapSize >> (16 - size)),
    };
  }

  private readPosition(reader: BinaryReader) {
    if (!this.reader || !this.header) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');

    if (this.header.version.major < 22) {
      return this.readPositionCompat(reader);
    }

    const size = reader.readInt32();
    const componentBits = size & 63;
    const byteCount = (componentBits + 7) >> 3;

    const x = reader.readBytesToInt(byteCount);
    const y = reader.readBytesToInt(byteCount);
    const z = reader.readBytesToInt(byteCount);

    const signBit = 1 << (byteCount * 8 - 1);

    const xSign = (x ^ signBit) - signBit;
    const ySign = (y ^ signBit) - signBit;
    const zSign = (z ^ signBit) - signBit;

    return {
      x: xSign,
      y: ySign,
      z: zSign,
    };
  }

  private async resolveDisplayNames() {
    const accountIds: string[] = [];
    [...this.eliminations.map((e) => e.eliminated), ...this.eliminations.map((e) => e.eliminator)].forEach((p) => {
      if (!p.isBot && p.id && !accountIds.includes(p.id)) accountIds.push(p.id);
    });

    const accounts = await queryAccounts(accountIds);

    accounts.forEach((a) => {
      this.eliminations.forEach((e) => {
        if (e.eliminated.id === a.id) e.eliminated.name = a.displayName || a.externalAuths[0].externalDisplayName;
        if (e.eliminator.id === a.id) e.eliminator.name = a.displayName || a.externalAuths[0].externalDisplayName;
      });
    });
  }

  private toObject() {
    if (!this.meta || !this.header || !this.eliminations) {
      throw new Error('Cannot use <ReplayReader>.toObject() before replay was parsed');
    }

    return {
      meta: this.meta,
      header: this.header,
      matchStats: this.matchStats,
      teamMatchStats: this.teamMatchStats,
      eliminations: this.eliminations,
      /** contains a list of additional game files that are required to watch the replay */
      additionGfps: this.additionGfps,
      safeZones: this.safeZones,
      playerPositions: this.playerPositions,
    };
  }

  public static async parse(replay: Parseable, config?: ReaderConfig) {
    const replayBuffer = Buffer.isBuffer(replay) ? replay : await fs.readFile(replay);

    const reader = new ReplayReader(replayBuffer);
    const meta = reader.parseMeta();
    reader.parseChunks(meta);

    if (config?.resolveAccountNames) await reader.resolveDisplayNames();

    return reader.toObject();
  }
}

export default ReplayReader;
