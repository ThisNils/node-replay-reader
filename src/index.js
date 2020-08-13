const Parser = require('./parser.js');

/**
 * Parse the replays meta
 * @param {Parser} replay the replay
 */
const parseMeta = (replay) => {
  const magic = replay.readUInt32();
  const fileVersion = replay.readUInt32();
  const lengthInMs = replay.readUInt32();
  const networkVersion = replay.readUInt32();
  const changelist = replay.readUInt32();
  const name = replay.readString();
  const isLive = replay.readBool();

  let timestamp;
  if (fileVersion >= 3) timestamp = new Date(parseInt((replay.readUInt64() - BigInt('621355968000000000')) / BigInt('10000'), 10));

  let isCompressed;
  if (fileVersion >= 2) isCompressed = replay.readBool();

  let isEncrypted = false;
  let encryptionKey;
  if (fileVersion >= 6) {
    isEncrypted = replay.readBool();
    const encryptionKeyLength = replay.readUInt32();
    encryptionKey = Buffer.from(replay.readBytes(encryptionKeyLength));
  }

  if (!isLive && isEncrypted && encryptionKey.length === 0) throw new Error('Replay encrypted but no key was found!');

  if (isLive && isEncrypted) throw new Error('Replay encrypted but not completed');

  if (isEncrypted) {
    replay.encryption.isEncrypted = true;
    replay.encryption.key = encryptionKey;
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
    isEncrypted,
    encryptionKey,
  };
};

/**
 * Parses a player
 * @param {Parser} data the replay
 */
const parsePlayer = (data) => {
  const playerType = data.readByte().toString('hex');

  const player = { name: undefined, id: undefined, isBot: true };
  if (playerType === '03') {
    player.name = 'Bot';
  } else if (playerType === '10') {
    player.name = data.readString();
  } else {
    data.skip(1);
    player.id = data.readId();
    player.isBot = false;
  }

  return player;
};

/**
 * Parses a player elimination
 * @param {Parser} data the elim data
 * @param {number} timestamp the timestamp of this elim
 * @param {object} header header data
 */
const parsePlayerElim = (data, timestamp, header) => {
  let eliminated;
  let eliminator;
  if (header.engineNetworkVersion >= 11 && header.version.major >= 9) {
    data.skip(85);
    eliminated = parsePlayer(data);
    eliminator = parsePlayer(data);
  } else {
    if (header.version.branch === '++Fortnite+Release-4.0') data.skip(12);
    else if (header.version.branch === '++Fortnite+Release-4.2') data.skip(40);
    else data.skip(45);

    eliminated = { name: undefined, id: data.readString(), isBot: false };
    eliminator = { name: undefined, id: data.readString(), isBot: false };
  }
  const gunType = data.readByte().toString('hex');
  const knocked = data.readBool();

  return {
    eliminated,
    eliminator,
    gunType,
    knocked,
    timestamp,
  };
};

/**
 * Parses the match stats event
 * @param {Parser} data the match stats data
 */
const parseMatchStats = (data) => {
  data.skip(4);
  const accuracy = data.readFloat32();
  const assists = data.readUInt32();
  const eliminations = data.readUInt32();
  const weaponDamage = data.readUInt32();
  const otherDamage = data.readUInt32();
  const revives = data.readUInt32();
  const damageTaken = data.readUInt32();
  const damageToStructures = data.readUInt32();
  const materialsGathered = data.readUInt32();
  const materialsUsed = data.readUInt32();
  const totalTraveled = Math.round(data.readUInt32() / 100000);

  return {
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
};

/**
 * Parses the match team stats event
 * @param {Parser} data the match team stats data
 */
const parseMatchTeamStats = (data) => {
  data.skip(4);
  const position = data.readUInt32();
  const totalPlayers = data.readUInt32();

  return {
    position,
    totalPlayers,
  };
};

/**
 * Parse a replay event
 * @param {Parser} replay the replay
 * @param {object} header header data
 */
const parseEvent = (replay, header) => {
  const eventId = replay.readString();
  const group = replay.readString();
  const metadata = replay.readString();
  const startTime = replay.readUInt32();
  const endTime = replay.readUInt32();
  const length = replay.readUInt32();

  let data = new Parser(replay.decryptBuffer(length));
  if (group === 'playerElim') {
    data = parsePlayerElim(data, startTime, header);
  } else if (metadata === 'AthenaMatchStats') {
    data = parseMatchStats(data);
  } else if (metadata === 'AthenaMatchTeamStats') {
    data = parseMatchTeamStats(data);
  } // else data = undefined;

  return {
    eventId,
    group,
    metadata,
    startTime,
    endTime,
    data,
  };
};

/**
 * Parse the header event
 * @param {Parser} replay the replay
 */
const parseHeader = (replay) => {
  const magic = replay.readUInt32();
  const networkVersion = replay.readUInt32();
  const networkChecksum = replay.readUInt32();
  const engineNetworkVersion = replay.readUInt32();
  const gameNetworkProtocol = replay.readUInt32();

  let id;
  if (networkVersion > 12) id = replay.readId();

  replay.skip(4);
  const patch = replay.readUInt16();
  const changelist = replay.readUInt32();
  const branch = replay.readString();
  const levelNamesAndTimes = replay.readObjectArray((r) => r.readString(), (r) => r.readUInt32());
  const flags = replay.readUInt32();
  const gameSpecificData = replay.readArray((r) => r.readString());

  const major = parseInt(branch.match(/(?<=-)\d*/)[0], 10);
  const minor = parseInt(branch.match(/\d*$/)[0], 10);

  const headerData = {
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
  return {
    type: 'header',
    data: headerData,
  };
};

/**
 * Parse the replays chunks
 * @param {Parser} replay the replay
 */
const parseChunks = (replay) => {
  const chunks = [];
  let header;
  while (replay.buffer.byteLength > replay.offset) {
    const chunkType = replay.readUInt32();
    const chunkSize = replay.readInt32();
    const startOffset = replay.offset;

    switch (chunkType) {
      case 0: {
        const parsedHeader = parseHeader(replay);
        chunks.push(parsedHeader);
        header = parsedHeader.data;
      } break;
      case 1: break;
      case 2: break;
      case 3: chunks.push(parseEvent(replay, header)); break;
      
      default: break;
    }

    replay.offset = startOffset + chunkSize;
  }
  return chunks;
};

/**
 * Replay to parse
 * @param {Buffer} buf replay buffer
 */
const parse = (buf) => {
  const parser = new Parser(buf);
  const data = {};

  data.meta = parseMeta(parser);
  data.chunks = parseChunks(parser);

  delete data.meta.encryptionKey;
  delete data.chunks.find((c) => c.type === 'header').data.levelNamesAndTimes;

  return {
    eliminations: data.chunks.filter((c) => c.group === 'playerElim').map((c) => c.data),
    matchStats: data.chunks.filter((c) => c.metadata === 'AthenaMatchStats').map((c) => c.data)[0],
    teamMatchStats: data.chunks.filter((c) => c.metadata === 'AthenaMatchTeamStats').map((c) => c.data)[0],
    header: data.chunks.find((c) => c.type === 'header').data,
    meta: data.meta,
  };
};

module.exports = parse;
