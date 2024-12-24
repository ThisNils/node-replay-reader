import BinaryReader from './BinaryReader';

export interface ParserParseFunction<T> {
  // eslint-disable-next-line no-unused-vars
  (reader: BinaryReader): T,
}

export interface ReadObjectResult<U> {
  [key: string]: U,
}

export interface HasToString {
  toString(): string,
}

export interface ReaderConfig {
  // eslint-disable-next-line no-unused-vars
  debug?: ((msg: string) => void);
  resolveAccountNames?: boolean;
}

export type Parseable = Buffer | string;

export interface ReplayEncryption {
  isEncrypted?: boolean;
  encryptionKey?: Buffer;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Vector4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface ReplayMeta {
  magic: number;
  fileVersion: number;
  lengthInMs: number;
  networkVersion: number;
  changelist: number;
  name: string;
  isLive: boolean;
  timestamp?: Date;
  isCompressed?: boolean;
}

export interface ReplayHeader {
  magic: number;
  networkVersion: number;
  networkChecksum: number;
  engineNetworkVersion: number;
  gameNetworkProtocol: number;
  id: string | undefined;
  version: {
    branch: string;
    major: number;
    minor: number;
    changelist: number;
    patch: number;
  };
  fileVersionUE4?: number;
  fileVersionUE5?: number;
  packageVersionLicenseeUe?: number;
  levelNamesAndTimes: ReadObjectResult<number>;
  flags: number;
  gameSpecificData: any[];
}

export interface Location {
  rotation: Vector4,
  position: Vector3,
  scale: Vector3,
}

export interface ReplayPlayer {
  name?: string;
  id?: string;
  isBot: boolean;
  location?: Location;
}

export interface ReplayElimination {
  eliminated: ReplayPlayer;
  eliminator: ReplayPlayer;
  gunType: string;
  knocked: boolean;
  timestamp: number;
}

export interface ReplayMatchStats {
  accuracy: number;
  assists: number;
  eliminations: number;
  weaponDamage: number;
  otherDamage: number;
  revives: number;
  damageTaken: number;
  damageToStructures: number;
  materialsGathered: number;
  materialsUsed: number;
  totalTraveled: number;
}

export interface ReplayTeamMatchStats {
  position: number;
  totalPlayers: number;
}

export interface AdditionGfp {
  moduleId: string;
  moduleVersion?: number;
  artifactId?: string;
}

export interface SafeZone {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface PlayerPosition {
  x: number;
  y: number;
  z: number;
  movementStyle: string;
}

export interface PlayerPositions {
  [id: string]: {
    [time: number]: PlayerPosition;
  },
}

export enum FLocalFileReplayCustomVersion {
  BeforeCustomVersionWasAdded = 0,

  FixedSizeFriendlyName,
  CompressionSupport,
  RecordingTimestamp,
  StreamChunkTimes,
  FriendlyNameCharEncoding,
  EncryptionSupport,
  CustomVersions,

  VersionPlusOne,
  LatestVersion = VersionPlusOne - 1,
}
