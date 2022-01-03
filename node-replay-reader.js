const CryptoJSWordArrayToArrayBuffer = (wordArray) => {
    const words = wordArray.words;
    const sigBytes = wordArray.sigBytes;
    const bytes = new Uint8Array(sigBytes);
    for (let i = 0; i < sigBytes; i++) {
        bytes[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return bytes.buffer;
}

class BinaryReader {
    constructor(buffer) {
        this.buffer = new DataView(buffer);
        this.offset = 0;
    }
    /**
     * Skip bytes
     */
    skip(count) {
        this.offset += count;
    }
    /**
     * Change the current buffer offset
     */
    goto(offset) {
        this.offset = offset;
    }
    /**
     * Read an int8
     */
    readInt8() {
        const int8 = this.buffer.getInt8(this.offset);
        this.offset += 1;
        return int8;
    }
    /**
     * Read a uint8
     */
    readUInt8() {
        const uint8 = this.buffer.getUint8(this.offset);
        this.offset += 1;
        return uint8;
    }
    /**
     * Read an int16
     */
    readInt16() {
        const int16 = this.buffer.getInt16(this.offset, true);
        this.offset += 2;
        return int16;
    }
    /**
     * Read a uint16
     */
    readUInt16() {
        const uint16 = this.buffer.getUint16(this.offset, true);
        this.offset += 2;
        return uint16;
    }
    /**
     * Read an int32
     */
    readInt32() {
        const int32 = this.buffer.getInt32(this.offset, true);
        this.offset += 4;
        return int32;
    }
    /**
     * Read a uint32
     */
    readUInt32() {
        const uint32 = this.buffer.getUint32(this.offset, true);
        this.offset += 4;
        return uint32;
    }
    /**
     * Read an int64
     */
    readInt64() {
        const int64 = this.buffer.getBigInt64(this.offset, true);
        this.offset += 8;
        return int64;
    }
    /**
     * Read a uint64
     */
    readUInt64() {
        const uint64 = this.buffer.getBigUint64(this.offset, true);
        this.offset += 8;
        return uint64;
    }
    /**
     * Read a float32
     */
    readFloat32() {
        const float32 = this.buffer.getFloat32(this.offset, true);
        this.offset += 4;
        return float32;
    }
    /**
     * Read a string
     */
    readString() {
        const length = this.readInt32();
        if (length === 0)
            return '';
        if (length < 0)
            return new TextDecoder('utf-16le').decode(this.readBytes(length * -2).slice(0, -2)).trim();
        const str = this.readBytes(length).slice(0, -1);
        return new TextDecoder().decode(str);
    }
    /**
     * Read a boolean
     */
    readBool() {
        return this.readInt32() === 1;
    }
    /**
     * Read a byte
     */
    readByte() {
        return this.readUInt8();
    }
    /**
     * Read multiple bytes
     */
    readBytes(count) {
        const bytes = this.buffer.buffer.slice(this.offset, this.offset + count);
        this.offset += count;
        return bytes;
    }
    /**
     * Read 16 bytes as a hex string
     */
    readId() {
        return [...new Uint8Array(this.readBytes(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    /**
     * Read an array
     */
    // eslint-disable-next-line no-unused-vars
    readArray(fn) {
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
    readObjectArray(keyFn, valueFn) {
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
    decryptBuffer(encryptedLength, key) {
        const bytes = this.readBytes(encryptedLength);

        const bytesAsHex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
        const cipher = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Hex.parse(bytesAsHex))

        const decryptedArrayBuffer = CryptoJS.AES.decrypt(cipher, key, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.NoPadding,
        });

        return CryptoJSWordArrayToArrayBuffer(decryptedArrayBuffer);
    }
}

class ReplayReader {
    constructor(replay, config) {
        this.config = {
            debug: undefined,
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
        if (!replay)
            throw new Error('Please provide a replay in the client constructor');
    }
    async parse() {
        this.reader = new BinaryReader(this.replay);
        this.meta = this.parseMeta();
        this.parseChunks();
        return this.toObject();
    }
    parseMeta() {
        if (!this.reader)
            throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');
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
        if (fileVersion >= 2)
            isCompressed = this.reader.readBool();
        let isEncrypted = false;
        let encryptionKey = CryptoJS.lib.WordArray.create(new ArrayBuffer(0));
        if (fileVersion >= 6) {
            isEncrypted = this.reader.readBool();
            const encryptionKeyLength = this.reader.readUInt32();
            const encryptionKeyBuffer = [...new Uint8Array(this.reader.readBytes(encryptionKeyLength))].map((e) => e.toString(16).padStart(2, '0')).join('');
            encryptionKey = CryptoJS.enc.Hex.parse(encryptionKeyBuffer);
        }
        if (!isLive && isEncrypted && encryptionKey.length === 0)
            throw new Error('Cannot read encrypted replay without encryption key');
        if (isLive && isEncrypted)
            throw new Error('Cannot read encrypted live replay');
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
    parseChunks() {
        if (!this.reader)
            throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');
        while (this.reader.buffer.byteLength > this.reader.offset) {
            const chunkType = this.reader.readUInt32();
            const chunkSize = this.reader.readInt32();
            const startOffset = this.reader.offset;
            switch (chunkType) {
                case 0:
                    this.header = this.parseHeader();
                    break;
                case 1: break;
                case 2: break;
                case 3:
                    this.parseEvent();
                    break;
            }
            this.reader.goto(startOffset + chunkSize);
        }
    }
    parseHeader() {
        if (!this.reader)
            throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');
        const magic = this.reader.readUInt32();
        const networkVersion = this.reader.readUInt32();
        const networkChecksum = this.reader.readUInt32();
        const engineNetworkVersion = this.reader.readUInt32();
        const gameNetworkProtocol = this.reader.readUInt32();
        let id;
        if (networkVersion > 12)
            id = this.reader.readId();
        this.reader.skip(4);
        const patch = this.reader.readUInt16();
        const changelist = this.reader.readUInt32();
        const branch = this.reader.readString();
        const levelNamesAndTimes = this.reader.readObjectArray((r) => r.readString(), (r) => r.readUInt32());
        const flags = this.reader.readUInt32();
        const gameSpecificData = this.reader.readArray((r) => r.readString());
        const major = parseInt(branch.match(/(?<=-)\d*/)[0], 10);
        const minor = parseInt(branch.match(/\d*$/)[0], 10);
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
    parseEvent() {
        if (!this.reader)
            throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');
        if (!this.header)
            throw new Error('Replay is missing a header chunk');
        this.reader.readString(); // eventId
        const group = this.reader.readString();
        const metadata = this.reader.readString();
        const startTime = this.reader.readUInt32();
        this.reader.readUInt32(); // endTime
        const size = this.reader.readUInt32();
        const decryptedEventBuffer = this.encryption.encryptionKey
            ? this.reader.decryptBuffer(size, this.encryption.encryptionKey) : this.reader.readBytes(size);
        const eventReader = new BinaryReader(decryptedEventBuffer);
        if (group === 'playerElim')
            this.parsePlayerElim(eventReader, startTime);
        else if (metadata === 'AthenaMatchStats')
            this.parseMatchStats(eventReader);
        else if (metadata === 'AthenaMatchTeamStats')
            this.parseTeamMatchStats(eventReader);
    }
    parsePlayerElim(reader, timestamp) {
        if (!this.reader || !this.header)
            throw new Error('This is an internal method which is not supposed to be called manually. Please use <ReplayReader>.parse()');
        let eliminated;
        let eliminator;
        if (this.header.engineNetworkVersion >= 11 && this.header.version.major >= 9) {
            reader.skip(85);
            eliminated = this.parsePlayer(reader);
            eliminator = this.parsePlayer(reader);
        }
        else {
            if (this.header.version.branch === '++Fortnite+Release-4.0')
                reader.skip(12);
            else if (this.header.version.branch === '++Fortnite+Release-4.2')
                reader.skip(40);
            else
                reader.skip(45);
            eliminated = { name: undefined, id: reader.readString(), isBot: false };
            eliminator = { name: undefined, id: reader.readString(), isBot: false };
        }
        const gunType = reader.readByte().toString(16).padStart(2, '0');
        const knocked = reader.readBool();
        this.eliminations.push({
            eliminated,
            eliminator,
            gunType,
            knocked,
            timestamp,
        });
    }
    parsePlayer(reader) {
        const byte = reader.readByte();
        const playerType = byte.toString(16).padStart(2, '0');
        const player = { name: undefined, id: undefined, isBot: true };
        if (playerType === '03') {
            player.name = 'Bot';
        }
        else if (playerType === '10') {
            player.name = reader.readString();
        }
        else {
            reader.skip(1);
            player.id = reader.readId();
            player.isBot = false;
        }
        return player;
    }
    parseMatchStats(reader) {
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
    parseTeamMatchStats(reader) {
        reader.skip(4);
        const position = reader.readUInt32();
        const totalPlayers = reader.readUInt32();
        this.teamMatchStats = {
            position,
            totalPlayers,
        };
    }
    toObject() {
        if (!this.meta || !this.header || !this.eliminations) {
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

window.ReplayReader = ReplayReader;
