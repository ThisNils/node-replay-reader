import crypto from 'crypto';

class BinaryReader {
  buffer: Buffer;
  offset: number;
  engineNetworkVersion: number;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.offset = 0;
    this.engineNetworkVersion = 0;
  }

  /**
   * Skip bytes
   */
  skip(count: number) {
    this.offset += count;
  }

  /**
   * Change the current buffer offset
   */
  goto(offset: number) {
    this.offset = offset;
  }

  /**
   * Read an int8
   */
  readInt8() {
    const int8 = this.buffer.readInt8(this.offset);
    this.offset += 1;
    return int8;
  }

  /**
   * Read a uint8
   */
  readUInt8() {
    const uint8 = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return uint8;
  }

  /**
   * Read an int16
   */
  readInt16() {
    const int16 = this.buffer.readInt16LE(this.offset);
    this.offset += 2;
    return int16;
  }

  /**
   * Read a uint16
   */
  readUInt16() {
    const uint16 = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return uint16;
  }

  /**
   * Read an int32
   */
  readInt32() {
    const int32 = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return int32;
  }

  /**
   * Read a uint32
   */
  readUInt32() {
    const uint32 = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return uint32;
  }

  /**
   * Read an int64
   */
  readInt64() {
    const int64 = this.buffer.readBigInt64LE(this.offset);
    this.offset += 8;
    return int64;
  }

  /**
   * Read a uint64
   */
  readUInt64() {
    const uint64 = this.buffer.readBigUInt64LE(this.offset);
    this.offset += 8;
    return uint64;
  }

  /**
   * Read a float32
   */
  readFloat32() {
    const float32 = this.buffer.readFloatLE(this.offset);
    this.offset += 4;
    return float32;
  }

  /**
   * Read a double64 if the replay supports it. if not read a float32
   */
  readDouble64() {
    if (this.engineNetworkVersion < 23) {
      return this.readFloat32();
    }

    const double64 = this.buffer.readDoubleLE(this.offset);
    this.offset += 8;
    return double64;
  }

  /**
   * Read a string
   */
  readString() {
    const length = this.readInt32();
    if (length === 0) return '';
    if (length < 0) return this.readBytes(length * -2).slice(0, -2).toString('utf16le').trim();

    const str = this.readBytes(length).slice(0, -1);

    return str.toString('utf-8');
  }

  /**
   * Read a boolean
   */
  readBool() {
    return this.readInt32() === 1;
  }

  /**
   * Read a 4 dimensional vector consisting of floats
   */
  readVector4f() {
    return {
      x: this.readFloat32(),
      y: this.readFloat32(),
      z: this.readFloat32(),
      w: this.readFloat32(),
    };
  }

  /**
   * Read a 3 dimensional vector consisting of floats
   */
  readVector3f() {
    return {
      x: this.readFloat32(),
      y: this.readFloat32(),
      z: this.readFloat32(),
    };
  }

  /**
   * Read a 4 dimensional vector consisting of doubles if the replay supports it. if not read a 4 dimensional vector consisting of floats
   */
  readVector4d() {
    if (this.engineNetworkVersion < 23) {
      return this.readVector4f();
    }

    return {
      x: this.readDouble64(),
      y: this.readDouble64(),
      z: this.readDouble64(),
      w: this.readDouble64(),
    };
  }

  /**
   * Read a 3 dimensional vector consisting of doubles if the replay supports it. if not read a 3 dimensional vector consisting of floats
   */
  readVector3d() {
    if (this.engineNetworkVersion < 23) {
      return this.readVector3f();
    }

    return {
      x: this.readDouble64(),
      y: this.readDouble64(),
      z: this.readDouble64(),
    };
  }

  /**
   * Read a byte
   */
  readByte() {
    const byte = Buffer.from(this.buffer.toString('binary', this.offset, this.offset + 1), 'binary');
    this.offset += 1;
    return byte;
  }

  /**
   * Read multiple bytes
   */
  readBytes(count: number) {
    const bytes = Buffer.from(this.buffer.toString('binary', this.offset, this.offset + count), 'binary');
    this.offset += count;
    return bytes;
  }

  /**
   * Read multiple bytes to a number
   */
  readBytesToInt(count: number) {
    const bytes = this.readBytes(count);

    return bytes.reduce((oldByte, byte, i) => oldByte + (byte << (i * 8)), 0);
  }

  /**
   * Read 16 bytes as a hex string
   */
  readId() {
    return this.readBytes(16).toString('hex');
  }

  /**
   * Read an array
   */
  // eslint-disable-next-line no-unused-vars
  readArray(fn: (reader: BinaryReader) => any) {
    const arrayLength = this.readUInt32();
    const array = [];
    for (let i = 0; i < arrayLength; i += 1) {
      array.push(fn(this));
    }
    return array;
  }

  /**
   * Read an array that consists of objects
   */
  // eslint-disable-next-line no-unused-vars
  readObjectArray(keyFn: (reader: BinaryReader) => any, valueFn: (reader: BinaryReader) => any) {
    const arrayLength = this.readUInt32();
    const array = [];
    for (let i = 0; i < arrayLength; i += 1) {
      array.push(Object.defineProperty({}, keyFn(this), { value: valueFn(this) }));
    }
    return array;
  }

  /**
   * Decrypt a buffer
   */
  decryptBuffer(encryptedLength: number, key: crypto.CipherKey) {
    const bytes = this.readBytes(encryptedLength);
    const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
    return Buffer.from((decipher.update as any)(bytes, 'binary', 'binary') + decipher.final('binary'), 'binary');
  }
}

export default BinaryReader;
