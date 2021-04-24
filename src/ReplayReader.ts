/* eslint-disable class-methods-use-this */
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
} from './structs';

class ReplayReader {
  private config: ReaderConfig;
  private replay: Parseable;
  private reader?: BinaryReader;
  private encryption: ReplayEncryption;
  private meta?: ReplayMeta;
  private header?: ReplayHeader;
  private eliminations: ReplayElimination[];
  private matchStats?: ReplayMatchStats;
  private teamMatchStats?: ReplayTeamMatchStats;

  constructor(replay: Parseable, config?: ReaderConfig) {
    this.config = {
      debug: undefined,
      resolveAccountNames: false,
      ...config,
    };

    this.replay = replay;
    this.reader = undefined;

    this.encryption = {
      isEncrypted: undefined,
      encryptionKey: undefined,
    };

    this.meta = undefined;
    this.header = undefined;
    this.eliminations = [];
    this.matchStats = undefined;
    this.teamMatchStats = undefined;

    if (!replay) throw new Error('Please provide a replay in the client constructor');
  }

  public async parse() {
    if (typeof this.replay === 'string') {
      this.replay = await fs.readFile(this.replay);
    }

    this.reader = new BinaryReader(this.replay);

    this.meta = this.parseMeta();
    this.parseChunks();

    if (this.config.resolveAccountNames) {
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

    return this.toObject();
  }

  private parseMeta(): ReplayMeta {
    if (!this.reader) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');

    const magic = this.reader.readUInt32();
    const fileVersion = this.reader.readUInt32();
    const lengthInMs = this.reader.readUInt32();
    const networkVersion = this.reader.readUInt32();
    const changelist = this.reader.readUInt32();
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
      encryptionKey = Buffer.from(this.reader.readBytes(encryptionKeyLength));
    }

    if (!isLive && isEncrypted && encryptionKey.length === 0) throw new Error('Cannot read encrypted replay without encryption key');

    if (isLive && isEncrypted) throw new Error('Cannot read encrypted live replay');

    if (isEncrypted) {
      this.encryption.isEncrypted = true;
      this.encryption.encryptionKey = encryptionKey;
    }

    return {
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
  }

  private parseChunks() {
    if (!this.reader) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');

    while (this.reader.buffer.byteLength > this.reader.offset) {
      const chunkType = this.reader.readUInt32();
      const chunkSize = this.reader.readInt32();
      const startOffset = this.reader.offset;

      switch (chunkType) {
        case 0: this.header = this.parseHeader(); break;
        case 1: break;
        case 2: break;
        case 3: this.parseEvent(); break;
      }

      this.reader.goto(startOffset + chunkSize);
    }
  }

  private parseHeader() {
    if (!this.reader) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');

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
    const branch = this.reader.readString();
    const levelNamesAndTimes = this.reader.readObjectArray((r) => r.readString(), (r) => r.readUInt32());
    const flags = this.reader.readUInt32();
    const gameSpecificData = this.reader.readArray((r) => r.readString());

    const major = parseInt((branch.match(/(?<=-)\d*/) as any[])[0], 10);
    const minor = parseInt((branch.match(/\d*$/)as any[])[0], 10);

    return {
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
      ? this.reader.decryptBuffer(size, this.encryption.encryptionKey) : this.reader.readBytes(size);

    const eventReader = new BinaryReader(decryptedEventBuffer);

    if (group === 'playerElim') this.parsePlayerElim(eventReader, startTime);
    else if (metadata === 'AthenaMatchStats') this.parseMatchStats(eventReader);
    else if (metadata === 'AthenaMatchTeamStats') this.parseTeamMatchStats(eventReader);
  }

  private parsePlayerElim(reader: BinaryReader, timestamp: number) {
    if (!this.reader || !this.header) throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');

    let eliminated;
    let eliminator;

    if (this.header.engineNetworkVersion >= 11 && this.header.version.major >= 9) {
      reader.skip(85);
      eliminated = this.parsePlayer(reader);
      eliminator = this.parsePlayer(reader);
    } else {
      if (this.header.version.branch === '++Fortnite+Release-4.0') reader.skip(12);
      else if (this.header.version.branch === '++Fortnite+Release-4.2') reader.skip(40);
      else reader.skip(45);

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

  private toObject() {
    if (!this.meta || !this.header || !this.matchStats || !this.eliminations) {
      throw new Error('Cannot use <ReplayReader>.toObject() before replay was parsed');
    }

    return {
      meta: this.meta,
      header: this.header,
      matchStats: this.matchStats,
      teamMatchStats: this.teamMatchStats,
      eliminations: this.eliminations,
    };
  }
}

export default ReplayReader;
