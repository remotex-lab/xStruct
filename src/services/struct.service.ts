/**
 * Import will remove at compile time
 */

import type {
    BitSizeType,
    PrimitiveType,
    SchemaFieldType,
    FieldInterface,
    SchemaInterface,
    ParseFieldInterface,
    StructSchemaInterface
} from '@services/interfaces/struct.interface';

export class Struct {
    /**
     * The `size` property represents the total size of the struct in bytes.
     * This value is calculated by summing the sizes of all fields in the struct,
     * taking into account both the bitfield and non-bitfield fields, as well as any padding needed for alignment.
     * The `size` is a read-only property and reflects the total memory required to store the struct, including all its fields
     * and their respective positions and offsets.
     *
     * - **Type**: `number`
     * - **Description**: The total size of the struct in bytes.
     *
     * ## Example:
     * ```ts
     * const structSize = myStruct.size;
     * console.log(structSize); // Logs the total size of the struct in bytes
     * ```
     */

    readonly size: number;

    /**
     * The `schema` property stores the parsed representation of a struct schema.
     * It is a read-only object that maps each field name to an object describing the field's type, size, offset, and other relevant attributes.
     * The schema object is populated when the struct is parsed, and it reflects the internal structure of the struct.
     *
     * - **Type**: `SchemaInterface`
     * - **Description**: A read-only object containing the parsed schema for the struct. It includes information about the fields such as:
     *   - `type`: The type of the field (e.g., `'UInt8'`, `'Int16'`).
     *   - `size`: The size of the field in bytes.
     *   - `offset`: The offset of the field within the struct, measured in bytes.
     *   - `isBits`: A boolean indicating whether the field is a bitfield or a regular field.
     *   - `position`: (optional) The bit position within the byte for bitfield fields.
     *
     * ## Example:
     * ```ts
     * const structSchema = myStruct.schema;
     * console.log(structSchema);
     * // Expected output format:
     * // {
     * //   field1: { type: 'UInt8', size: 1, isBits: false, offset: 0 },
     * //   field2: { type: 'UInt8:4', size: 4, isBits: true, offset: 1, position: 0 }
     * // }
     * ```
     */

    private readonly schema: SchemaInterface = {};

    /**
     * The constructor initializes a new instance of the class by parsing the provided struct schema.
     * It takes a `StructSchemaInterface` object, processes the schema to determine the field types, sizes, and offsets,
     * and calculates the total size of the struct in bytes. The result is stored in the `size` property.
     *
     * - **Input**:
     *   - `schema` (StructSchemaInterface): The struct schema object representing the field names and their associated type/size information.
     *     Each field is represented either as a string (e.g., `'UInt8'`, `'UInt8:4'`) or a more complex object indicating its type.
     *
     * - **Output**:
     *   - The constructor does not return a value. Instead, it initializes the `size` property, which represents the total size of the struct.
     *     The struct size is calculated in bytes by calling the `parseSchema` method.
     *
     * ## Example:
     * ```ts
     * const structSchema: StructSchemaInterface = {
     *     field1: 'UInt8',
     *     field2: 'UInt8:4',
     *     field3: 'UInt16'
     * };
     *
     * const struct = new MyStruct(structSchema);
     * console.log(struct.size); // Outputs the total size of the struct in bytes.
     * ```
     *
     * ## Notes:
     * - The constructor invokes `parseSchema` to process the schema and determine the overall struct size based on the field definitions.
     * - The `size` property will be set to the calculated size in bytes after the constructor completes.
     */

    constructor(schema: StructSchemaInterface) {
        this.size = this.parseSchema(schema);
    }

    /**
     * The `toBuffer` method converts an object of type `T` into a `Buffer` by serializing its fields according to the schema
     * defined in the class. It iterates through the fields of the provided object, converts the data into the appropriate
     * binary format, and writes it to a `Buffer`.
     *
     * This method handles both regular fields (standard types) and bitfield fields (binary data represented as a series of bits).
     * It also supports nested `Struct` objects, serializing them into the buffer at the appropriate offsets.
     *
     * - **Input**:
     *   - `data`: An object of type `T` containing the data to be serialized. The object must contain fields matching the
     *     schema, with values that are either standard types or bitfields, depending on the field configuration. If the schema
     *     field is a nested `Struct`, the corresponding value in `data` must be an object.
     *
     * - **Output**:
     *   - A `Buffer` containing the binary data representing the provided object, serialized according to the schema.
     *
     * ## Example:
     * ```ts
     * const data = {
     *   field1: 10, // A value for the bitfield field
     *   field2: 177 // A value for the regular field
     * };
     *
     * const test = new Struct({
     *     field1: 'UInt8:4',
     *     field2: 'UInt8'
     * });
     *
     * const buffer = test.toBuffer(data);
     * console.log(buffer); // Buffer with serialized data based on the schema
     * ```
     *
     * ## Error Handling:
     * - If a field in the schema is missing in the input `data` object, it is ignored and not written to the buffer.
     * - The method assumes that the data in the object matches the field types defined in the schema. If the data type
     *   doesn't match, an error may occur during serialization.
     * - If a field is a nested `Struct`, the corresponding value in `data` must be an object. If the value is not an object
     *   (i.e., `null` or a primitive type), an error will be thrown indicating the mismatch:
     *   ```ts
     *   throw new Error(`Expected an object for field ${fieldName}, but received ${typeof nestedFieldValue}`);
     *   ```
     *
     * @param data - The object containing the data to be serialized into a buffer.
     * @returns A `Buffer` containing the serialized binary data of the object.
     */

    toBuffer<T extends object>(data: T): Buffer {
        const buffer = Buffer.alloc(this.size);
        if (!data || typeof data !== 'object') {
            throw new Error(`Expected an object of fields, but received ${ typeof data }`);
        }

        for (const fieldName in this.schema) {
            if (!(fieldName in data)) {
                continue;
            }

            const field = this.schema[fieldName];
            if (field.type instanceof Struct) {
                const nestedFieldValue = data[<keyof T> fieldName];
                if (nestedFieldValue) {
                    const nestedStructBuffer = field.type.toBuffer(nestedFieldValue);
                    buffer.set(nestedStructBuffer, field.offset);
                    continue;
                }

                throw new Error(`Expected an object for field ${ fieldName }, but received ${ typeof nestedFieldValue }`);
            } else if (field.isBits) {
                this.writeBitField(buffer, field, <number> data[<keyof T> fieldName]);
            } else {
                this.writeField(buffer, field, <unknown> data[<keyof T> fieldName]);
            }
        }

        return buffer;
    }

    /**
     * The `toObject` method converts a `Buffer` into an object by interpreting the buffer's data according to the schema
     * defined in the class.
     * It iterates through the schema fields, reads each field's value from the buffer, and maps them
     * to an object with the field names as keys.
     *
     * This method handles both regular fields (standard types) and bitfield fields
     * (binary data represented as a series of bits).
     *
     * - **Input**:
     *   - `buffer`: A `Buffer` containing the raw binary data to be interpreted.
     *   The method reads from this buffer according to the schema definition.
     *
     * - **Output**:
     *   - A new object of type `T`, where each field from the schema is populated with its
     *   corresponding value extracted from the buffer.
     *   The field values are either extracted from regular types or bitfields depending on their schema configuration.
     *
     * ## Example:
     * ```ts
     * const buffer = Buffer.from([ 0b11001010, 0b10110001 ]); // Example buffer with raw data
     * const test = new Struct({
     *     field1: 'UInt8:4',
     *     field2: 'UInt8'
     * });
     *
     * console.log(test.toObject(buffer)); // { field1: 10, field2: 177 }
     * ```
     *
     * ## Error Handling:
     * - The method assumes that the buffer contains enough data to extract values for all fields defined in the schema.
     * - If the buffer is too short to satisfy the field sizes,
     * or if the data cannot be properly interpreted based on the schema,
     * it may throw errors or return unexpected results.
     *
     * @param buffer - The buffer containing raw binary data to be parsed into an object.
     * @returns A new object of type `T` with values extracted from the buffer based on the schema.
     */

    toObject<T extends object>(buffer: Buffer): T {
        const result: Record<string, unknown> = {};
        for (const fieldName in this.schema) {
            const field = this.schema[fieldName];

            if (field.type instanceof Struct) {
                result[fieldName] = field.type.toObject(buffer.subarray(field.offset, field.offset + field.size));
            } else if (field.isBits) {
                result[fieldName] = this.readBitField(buffer, field);
            } else {
                result[fieldName] = this.readField(buffer, field);
            }
        }

        return result as T;
    }

    /**
     * The `validateBitfieldValue` method checks whether a given value fits within the bounds
     * of the specified bit field. It ensures that the value does not exceed the maximum or minimum
     * value allowed by the bit field's size and type (signed or unsigned).
     *
     * - **Input**:
     *   - `field` (SchemaFieldType): An object representing the bit field, which includes the
     *     `size` (number of bits) and `type` (either signed or unsigned integer type like `'Int8'`, `'UInt8'`).
     *   - `value` (number): The value to be validated against the bit field's bounds.
     *
     * - **Output**:
     *   - This method does not return any value. It throws a `RangeError` if the value is out of range.
     *
     * ## Example:
     *
     * ```ts
     * const field: SchemaFieldType = { type: 'UInt8', size: 8, offset: 0, isBits: true };
     * validateBitfieldValue(field, 255); // No error, valid value for UInt8.
     *
     * const field2: SchemaFieldType = { type: 'Int8', size: 8, offset: 0, isBits: true };
     * validateBitfieldValue(field2, -128); // No error, valid value for Int8.
     *
     * // Throws RangeError:
     * validateBitfieldValue(field, 256); // Throws RangeError: Value 256 does not fit within 8-bits for type UInt8
     * ```
     *
     * ## Error Handling:
     * - A `RangeError` is thrown if the provided `value` is less than the minimum allowed value or greater
     *   than the maximum allowed value for the specified bit field's type and size.
     *
     * @param field - A `SchemaFieldType` object representing the bit field with `type`, `size`, and other properties.
     * @param value - The value to validate against the bit field's range.
     * @throws {RangeError} If the value is outside the valid range for the bit field size and type.
     */

    private validateBitfieldValue(field: SchemaFieldType, value: number): void {
        const maxBitValue = (<string> field.type).startsWith('Int') ? (1 << field.size - 1) - 1 : (1 << field.size) - 1;
        const minBitValue = (<string> field.type).startsWith('Int') ? -(1 << (field.size - 1)) : 0;

        if (value < minBitValue || value > maxBitValue) {
            throw new RangeError(`Value ${ value } does not fit within ${ field.size } bits for type ${ field.type }`);
        }
    }

    /**
     * The `processValueForBitfield` method processes a given value based on the type of bit field (signed or unsigned).
     * For signed bit fields (e.g., `Int8`), it ensures proper sign extension using `BigInt.asIntN`.
     * For unsigned bit fields (e.g., `UInt8`), it returns the value as-is without any modification.
     *
     * - **Input**:
     *   - `field` (SchemaFieldType): The bit field object that includes the `type` (signed or unsigned) and `size` (number of bits).
     *   - `value` (number): The value to be processed for the bit field.
     *
     * - **Output**:
     *   - Returns a `number` that is the processed value, which is sign-extended if the bit field is signed, or the original value if the bit field is unsigned.
     *
     * ## Example:
     *
     * ```ts
     * const signedField: SchemaFieldType = { type: 'Int8', size: 8, offset: 0, isBits: true };
     * const signedValue = processValueForBitfield(signedField, -100);
     * console.log(signedValue);  // Ensures correct sign extension for Int8, returns processed value.
     *
     * const unsignedField: SchemaFieldType = { type: 'UInt8', size: 8, offset: 0, isBits: true };
     * const unsignedValue = processValueForBitfield(unsignedField, 200);
     * console.log(unsignedValue);  // Returns the original value (no sign extension for UInt8).
     * ```
     *
     * ## Error Handling:
     * - This method does not throw any errors but assumes that the value provided is within the valid range for the bit field.
     *   Any validation for out-of-range values should be handled separately (e.g., by `validateBitfieldValue`).
     *
     * @param field - The `SchemaFieldType` object representing the bit field with `type` and `size` properties.
     * @param value - The value to be processed according to the bit field type.
     * @returns The processed value, sign-extended for signed types or unchanged for unsigned types.
     */

    private processValueForBitfield(field: SchemaFieldType, value: number): number {
        if ((<string> field.type).startsWith('Int')) {
            // For signed values like Int8, use BigInt.asIntN to ensure proper sign extension
            const bitLength = field.size;
            const signedValue = BigInt(value); // Convert the value to BigInt

            return Number(BigInt.asIntN(bitLength, signedValue)); // Ensure sign extension
        }

        // For unsigned types, no further processing needed
        return value;
    }

    /**
     * The `applyBitmask` method applies a bitmask to a byte in order to modify specific bits within the byte.
     * It clears the bits that correspond to the bitfield and sets the bits based on the provided value.
     * This is typically used for updating or setting a bitfield value in a byte at a given position.
     *
     * - **Input**:
     *   - `currentByte`: A `number` representing the current byte to be modified. This byte may have other bits set that need to be cleared.
     *   - `field`: A `SchemaFieldType` object that defines the bitfield's properties, including `size` (the number of bits to modify).
     *   - `value`: A `number` representing the new value to be set in the bitfield. The value will be shifted to fit the bitfield size.
     *   - `bitPosition`: A `number` representing the position within the byte where the bitfield starts (0 is the least significant bit).
     *
     * - **Output**:
     *   - A `number` representing the modified byte with the updated bitfield value applied. The byte is modified by clearing and then setting the specified bits.
     *
     * ## Example:
     * ```ts
     * const currentByte = 0b11010101; // Initial byte (binary)
     * const field = { size: 4 }; // Field size is 4 bits
     * const value = 0b1010; // New value for the bitfield (4 bits)
     * const bitPosition = 4; // Start at bit position 4
     * const modifiedByte = applyBitmask(currentByte, field, value, bitPosition);
     * console.log(modifiedByte.toString(2)); // Expected Output: 11011010
     * ```
     *
     * ## Error Handling:
     * - The method assumes that the `value` fits within the size of the field (i.e., `value` should have at most `field.size` bits).
     * - If the provided `value` is too large for the specified field size, the result may be incorrect.
     *
     * @param currentByte - The byte to be modified.
     * @param field - The `SchemaFieldType` object that defines the bitfield size and other properties.
     * @param value - The value to set in the bitfield.
     * @param bitPosition - The starting position of the bitfield within the byte.
     * @returns A `number` representing the modified byte after applying the bitmask.
     */

    private applyBitmask(currentByte: number, field: SchemaFieldType, value: number, bitPosition: number): number {
        const mask = (1 << field.size) - 1; // Mask for the field size
        const shiftedMask = mask << bitPosition; // Shift mask to the correct position

        currentByte &= ~shiftedMask;
        const valueShifted = (value << bitPosition) & shiftedMask;

        return currentByte | valueShifted;
    }

    /**
     * The `writeBitField` method writes a value to a specific bitfield within a buffer. It validates the value, processes
     * the value based on its signed or unsigned type, and then updates the corresponding byte in the buffer by applying
     * a bitmask to ensure that only the relevant bits are modified.
     *
     * - **Input**:
     *   - `buffer` (Buffer): The buffer where the bitfield value will be written.
     *   - `field` (SchemaFieldType): The bitfield schema that defines the size, type, offset, and position of the bitfield.
     *   - `value` (number): The value to be written to the bitfield, which can be either signed or unsigned.
     *
     * - **Output**:
     *   - This method does not return any value. It modifies the `buffer` directly by writing the processed value into the appropriate byte.
     *
     * ## Example:
     *
     * ```ts
     * const buffer = Buffer.alloc(4);  // Create a 4-byte buffer
     * const field: SchemaFieldType = { type: 'UInt8', size: 8, offset: 0, isBits: true };
     * writeBitField(buffer, field, 255);  // Write the value 255 to the first byte (8 bits)
     * console.log(buffer);  // The first byte of the buffer should now contain 255 (0xFF).
     *
     * const signedField: SchemaFieldType = { type: 'Int8', size: 8, offset: 1, isBits: true };
     * writeBitField(buffer, signedField, -128);  // Write the signed value -128 to the second byte
     * console.log(buffer);  // The second byte of the buffer should contain -128 (0x80).
     * ```
     *
     * ## Error Handling:
     * - The `writeBitField` method validates that the value fits within the range defined by the bitfield size using the
     *   `validateBitfieldValue` method. If the value is out of range, a `RangeError` will be thrown.
     * - The method also handles signed and unsigned values using `processValueForBitfield` to ensure proper conversion
     *   before writing to the buffer.
     *
     * @param buffer - The `Buffer` where the value will be written.
     * @param field - The `SchemaFieldType` object containing information about the bitfield (size, type, offset, etc.).
     * @param value - The value to be written to the bitfield (can be signed or unsigned).
     * @throws {RangeError} If the value is out of range for the specified bitfield.
     */

    private writeBitField(buffer: Buffer, field: SchemaFieldType, value: number): void {
        this.validateBitfieldValue(field, value); // Validate value within the bitfield range

        // Calculate byte offset and bit position
        const byteOffset = field.offset;
        const bitPosition = field.position ?? 0;

        // Process the value according to its type (signed or unsigned)
        const processedValue = this.processValueForBitfield(field, value);

        // Read the current byte at the offset
        let currentByte = buffer[byteOffset];

        // Apply the bitmask to clear the bits for this field and prepare for the new value
        currentByte = this.applyBitmask(currentByte, field, processedValue, bitPosition);

        // Write the updated byte back to the buffer
        buffer[byteOffset] = currentByte;
    }

    /**
     * The `writeField` method writes a value to the buffer according to its field type.
     * It handles different types of values (e.g., strings, numbers, and BigInts) by calling the appropriate buffer write method.
     *
     * - **Input**:
     *   - `buffer`: The buffer to which the field value will be written.
     *   - `field`: The schema field containing information about the field's type, size, and offset.
     *   - `value`: The value to be written into the buffer.
     *
     * - **Error Handling**:
     *   - Throws a `TypeError` if the value is not a valid `number` or `BigInt` for numeric fields.
     *   - For string fields, it assumes the value is a valid string and writes it directly to the buffer.
     */

    private writeField(buffer: Buffer, field: SchemaFieldType, value: unknown): void {
        if (field.type === 'string') {
            if (typeof value !== 'string') {
                throw new TypeError(`Expected a string for field "${ field.type }", but received ${ typeof value }`);
            }

            buffer.write(<string> value, field.offset, field.size);

            return;
        }

        const isBigIntType = (<string> field.type).includes('Big');
        if (isBigIntType && typeof value !== 'bigint') {
            throw new TypeError(`Expected a BigInt for field "${ field.type }", but received ${ typeof value }`);
        } else if (!isBigIntType && typeof value !== 'number') {
            throw new TypeError(`Expected a number for field "${ field.type }", but received ${ typeof value }`);
        }

        const method = <(...args: Array<unknown>) => unknown> (
            buffer[<keyof Buffer> ('write' + field.type)]
        );

        // Convert value to the correct type (BigInt or number)
        const finalValue: bigint | number = isBigIntType
            ? BigInt(value as number)
            : value as number;

        // Write the value to the buffer
        method.call(buffer, finalValue, field.offset);
    }

    /**
     * The `readBitField` method reads a specific bitfield from a given buffer based on the field's offset and bit position.
     * It extracts the relevant bits from the byte at the specified offset, processes the value according to its signed
     * or unsigned type, and returns the field value.
     *
     * - **Input**:
     *   - `buffer`: A `Buffer` object containing the raw data to read the bitfield from.
     *   - `field`: A `SchemaFieldType` object that defines the bitfield's properties such as `offset`, `size`, and `position`.
     *
     * - **Output**:
     *   - The extracted and processed value from the bitfield as a `number`. This value is signed or unsigned based
     *     on the field's type.
     *
     * ## Example:
     *
     * ```ts
     * const buffer = Buffer.alloc(1);
     * buffer.writeUInt8(0b10101010, 0); // Write an example byte to the buffer
     * const field = { offset: 0, size: 4, position: 4, type: 'UInt8' };
     * const value = readBitField(buffer, field);
     * console.log(value); // Expected Output: 10 (binary: 1010)
     * ```
     *
     * ## Error Handling:
     * - This method assumes that the `field` contains valid offset and position information, and the buffer is large
     *   enough to contain the specified offset.
     *
     * @param buffer - The `Buffer` object from which the bitfield will be read.
     * @param field - The `SchemaFieldType` object describing the bitfield's position, size, and type.
     * @returns The value read from the bitfield, processed according to its type (signed or unsigned).
     */

    private readBitField(buffer: Buffer, field: SchemaFieldType): number {
        const byteOffset = field.offset;
        const bitPosition = field.position ?? 0;

        // Read the byte at the given offset
        const currentByte = buffer[byteOffset];

        // Create a mask to isolate the bits for this field
        const mask = (1 << field.size) - 1;
        const value = (currentByte >> bitPosition) & mask;

        // Process the value according to its signed/unsigned type
        return this.processValueForBitfield(field, value);
    }

    /**
     * The `readField` method reads a field from the given buffer based on its type and offset. It handles reading different
     * types of fields, including strings and numeric types (e.g., `UInt8`, `Int8`, `UInt16`), and returns the corresponding
     * value after decoding it from the buffer.
     *
     * - **Input**:
     *   - `buffer`: A `Buffer` object containing the raw data.
     *   - `field`: A `SchemaFieldType` object that defines the field's properties such as `offset`, `type`, and `size`.
     *
     * - **Output**:
     *   - The value of the field, which can be a `string`, `number`, or `bigint`, depending on the field's type.
     *
     * ## Example:
     *
     * ```ts
     * const buffer = Buffer.alloc(8);
     * buffer.writeUInt8(123, 0);
     * const field = { offset: 0, type: 'UInt8', size: 1 };
     * const value = readField(buffer, field);
     * console.log(value); // Expected Output: 123
     *
     * const stringBuffer = Buffer.from('Hello\x00\x00\x00');
     * const stringField = { offset: 0, type: 'string', size: 5 };
     * const stringValue = readField(stringBuffer, stringField);
     * console.log(stringValue); // Expected Output: 'Hello'
     * ```
     *
     * ## Error Handling:
     * - This method assumes the `field` object contains valid `offset`, `size`, and `type` properties, and the `buffer` is
     *   large enough to accommodate the requested field.
     * - If the type is unrecognized, this method will throw a runtime error due to the invalid `method` call.
     *
     * @param buffer - The `Buffer` object containing the data to be read.
     * @param field - The `SchemaFieldType` object describing the field’s `offset`, `type`, and `size`.
     * @returns The decoded value from the buffer as a `string`, `number`, or `bigint` based on the field type.
     */

    private readField(buffer: Buffer, field: SchemaFieldType): number | bigint | string {
        const byteOffset = field.offset;

        // If the field is a string, we read it as a string from the buffer
        if (field.type === 'string') {
            return buffer.toString('utf8', byteOffset, byteOffset + field.size).replace(/\x00+$/, '');
        }

        // For other types (UInt8, Int8, UInt16, etc.), use the corresponding Buffer method to read the value
        const method = <(...args: Array<unknown>) => unknown> buffer[<keyof Buffer> ('read' + field.type)];

        return <bigint | number> method.call(buffer, byteOffset, field.size);
    }

    /**
     * The `parseBitField` method converts bit field string (e.g., `'Int8:1'`, `'UInt8:2'`) into a `ParseFieldInterface` object.
     * It parses the field type and size from the input string and returns an object representing the bit field with the correct
     * type and size properties, while also indicating that the size is in bits.
     *
     * - **Input**: A `BitSizeType` string in the format `'type:size'`,
     *   where `type` can be either `'Int8'` (signed integer) or `'UInt8'` (unsigned integer),
     *   and `size` is the number of bits.
     * - **Output**: A `ParseFieldInterface` object with the corresponding `type`, `size`, and `isBits` properties.
     *
     * ## Example:
     *
     * ```ts
     * const result = parseBitField('UInt8:1');
     * console.log(result); // { type: 'UInt8', size: 1, isBits: true }
     *
     * const result2 = parseBitField('Int8:2');
     * console.log(result2); // { type: 'Int8', size: 2, isBits: true }
     * ```
     *
     * ## Error Handling:
     * - If the input string does not match the expected format (`'Int8:n'` or `'UInt8:n'`),
     *   an error is thrown indicating an invalid bit field format.
     *
     * @param field - A `BitSizeType` string representing bit field in the format `'type:size'`.
     * @returns A `ParseFieldInterface` object representing the parsed bit field, with `isBits: true`.
     * @throws {Error} If the input string does not match the expected format.
     */

    private parseBitField(field: BitSizeType): ParseFieldInterface {
        const match = field.match(/^(Int8|UInt8):(\d+)$/);
        if (!match) {
            throw new Error(`Invalid bit field format: ${ field }`);
        }

        const type = match[1] as 'UInt8' | 'Int8';
        const size = parseInt(match[2], 10);  // Size in bits

        return { type, size, isBits: true };
    }

    /**
     * The `parsePrimitiveField` method parses a given primitive type and returns a `ParseFieldInterface` object
     * that represents the parsed field with its corresponding size (in bytes).
     * This method supports common primitive types like signed and unsigned integers in various byte sizes.
     *
     * - **Input**: A `PrimitiveType` representing the type of the primitive field.
     *   The supported types include:
     *   - `'Int8'`, `'UInt8'` — 1 byte
     *   - `'Int16LE'`, `'Int16BE'`, `'UInt16LE'`, `'UInt16BE'` — 2 bytes
     *   - `'Int32LE'`, `'Int32BE'`, `'UInt32LE'`, `'UInt32BE'` — 4 bytes
     *   - `'Int64LE'`, `'Int64BE'`, `'UInt64LE'`, `'UInt64BE'` — 8 bytes
     *
     * - **Output**: A `ParseFieldInterface` object with the corresponding `type`, `size` (in bytes),
     * and `isBits` (set to `false`).
     *
     * ## Example:
     *
     * ```ts
     * const field1 = parsePrimitiveField('Int8');
     * console.log(field1); // { type: 'Int8', size: 1, isBits: false }
     *
     * const field2 = parsePrimitiveField('UInt16LE');
     * console.log(field2); // { type: 'UInt16LE', size: 2, isBits: false }
     * ```
     *
     * ## Error Handling:
     * - If the provided type is unsupported, the method throws a `TypeError`.
     *
     * @param type - The type of the field, which can be one of the supported primitive types.
     * @returns A `ParseFieldInterface` object representing the field type and size in bytes, with `isBits` set to `false`.
     * @throws {TypeError} If the input type is unsupported.
     */

    private parsePrimitiveField(type: PrimitiveType): ParseFieldInterface {
        const typeSizes: { [key in PrimitiveType]: number } = {
            'Int8': 1, 'UInt8': 1,
            'Int16LE': 2, 'Int16BE': 2, 'UInt16LE': 2, 'UInt16BE': 2,
            'Int32LE': 4, 'Int32BE': 4, 'UInt32LE': 4, 'UInt32BE': 4,
            'BigInt64LE': 8, 'BigInt64BE': 8, 'BigUInt64LE': 8, 'BigUInt64BE': 8
        };

        if (typeSizes[type]) {
            return { type, size: typeSizes[type], isBits: false };
        }

        throw new TypeError(`Unsupported primitive type: ${ type }`);
    }

    /**
     * The `parseField` method parses a given field, determining whether it's a string type or an object
     * and returns a `ParseFieldInterface` object. It will call the appropriate parsing function based on
     * whether the field is a bit field or a primitive type.
     *
     * - **Input**: A `FieldInterface` or string that represents the field type.
     * - **Output**: A `ParseFieldInterface` object with the parsed field details (type, size, isBit).
     *
     * ## Example:
     * ```ts
     * const fieldObject = parseField('Int8'); // Returns { type: 'Int8', size: 1, isBit: false }
     * const fieldObject2 = parseField('UInt8:4'); // Returns { type: 'UInt8', size: 4, isBit: true }
     * ```
     *
     * @param field - The field to parse, which could be a string or an object.
     * @returns A `ParseFieldInterface` object representing the parsed field.
     */

    private parseField(field: FieldInterface | string | Struct): ParseFieldInterface {
        if (field instanceof Struct) {
            return { type: field, size: field.size };
        }

        if (typeof field === 'string') {
            return field.includes(':')
                ? this.parseBitField(field as BitSizeType)
                : this.parsePrimitiveField(field as PrimitiveType);
        }

        return field;
    }

    /**
     * The `processBitfield` method updates the accumulator and the schema with the bitfield details.
     * It calculates the offset and position for bitfields and manages the byte and bit size accumulation
     * to ensure proper alignment and offset handling when parsing fields in a struct schema.
     *
     * - **Input**:
     *   - `name` (string): The name of the field being processed.
     *   - `accumulator` (object): An object that tracks the number of bits and bytes accumulated so far.
     *     - `bits` (number): The current number of accumulated bits.
     *     - `bytes` (number): The current number of accumulated bytes.
     *   - `field` (ParseFieldInterface): The field object, containing details like `type` (e.g., 'UInt8') and `size` (number of bits for bitfields).
     *
     * - **Output**:
     *   - This method updates the `schema` object with the parsed field information, including its `type`, `size`, `offset`, and `position`.
     *   - It modifies the accumulator, adjusting `bits` and `bytes` based on the size of the bitfield.
     *
     * ## Example:
     * ```ts
     * const accumulator = { bits: 0, bytes: 0 };
     * const field = { type: 'UInt8', size: 4, isBits: true };
     * const name = 'T1';
     * processBitfield(name, accumulator, field);
     * console.log(accumulator); // { bits: 4, bytes: 1 }
     * console.log(this.schema[name]); // { type: 'UInt8', size: 4, isBits: true, offset: 0, position: 0 }
     * ```
     *
     * ## Error Handling:
     * - This method assumes that the input `field` is always a valid bitfield (i.e., `field.isBits` is `true`).
     *
     * @param name - The name of the field to be processed.
     * @param accumulator - An object containing the current accumulation of bits and bytes.
     * @param field - A `ParseFieldInterface` object representing the field, including type and size (in bits).
     */

    private processBitfield(name: string, accumulator: {
        bits: number,
        bytes: number
    }, field: ParseFieldInterface): void {
        const nextTotalBits = accumulator.bits + field.size;
        if (nextTotalBits > 8) {
            accumulator.bits = 0;
            accumulator.bytes += 1;
        }

        this.schema[name] = {
            type: field.type,
            size: field.size,
            isBits: true,
            offset: accumulator.bytes,
            position: accumulator.bits
        };

        accumulator.bits += field.size;
    }

    /**
     * The `parseSchema` method processes a struct schema and builds a detailed `schema` object.
     * It iterates over each field in the struct schema, parses the field type, size, and determines whether the field
     * is a bitfield or a regular type (e.g., primitive type like 'UInt8', 'Int16').
     * Based on the type, it updates the schema and accumulates the total byte and bit sizes, ensuring proper alignment
     * and offsets for each field.
     *
     * - **Input**:
     *   - `schema` (StructSchemaInterface): An object representing the struct schema, where each key is a field name,
     *     and its value is either a string (e.g., 'UInt8', 'UInt8:4')
     *     or a more complex object that represents the field type.
     *
     * - **Output**:
     *   - This method returns the total size of the struct in bytes,
     *   calculated based on the field sizes and their positions.
     *   - The method also updates the `schema` object with each field’s `type`, `size`, `isBits`, `offset`, and `position`.
     *     - For non-bitfields, the field's offset is tracked in bytes.
     *     - For bitfields, the offset is tracked in bytes, and the position within the byte is also recorded.
     *
     * ## Example:
     * ```ts
     * const schema: StructSchemaInterface = {
     *     field1: 'UInt8',
     *     field2: 'UInt8:4',
     *     field3: 'UInt16'
     * };
     * const structSize = parseSchema(schema);
     * console.log(this.schema);
     * console.log(structSize); // Expected Output: 4 bytes
     * // Expected schema output:
     * // {
     * //   field1: { type: 'UInt8', size: 1, isBits: false, offset: 0 },
     * //   field2: { type: 'UInt8', size: 4, isBits: true, offset: 1, position: 0 },
     * //   field3: { type: 'UInt16', size: 2, isBits: false, offset: 2 }
     * // }
     * ```
     *
     * ## Error Handling:
     * - This method assumes that the input schema is valid and that `parseField` and `processBitfield` functions
     *   will properly handle the input field types.
     *
     * @param schema - The struct schema object containing field names and type/size information for each field.
     * @returns The total size of the struct in bytes.
     */

    private parseSchema(schema: StructSchemaInterface): number {
        const accumulator = {
            bits: 0,
            bytes: 0
        };

        for (const fieldName in schema) {
            const field = schema[fieldName];
            const fieldObject: ParseFieldInterface = this.parseField(field);

            if (!fieldObject.isBits) {
                if (accumulator.bits > 0) {
                    accumulator.bits = 0;
                    accumulator.bytes += 1;
                }

                this.schema[fieldName] = {
                    type: fieldObject.type,
                    size: fieldObject.size,
                    isBits: false,
                    offset: accumulator.bytes
                };

                accumulator.bits = 0;
                accumulator.bytes += fieldObject.size;
                continue;
            }

            this.processBitfield(fieldName, accumulator, fieldObject);
        }

        if (accumulator.bits > 0) {
            accumulator.bytes += 1;
        }

        return accumulator.bytes;
    }
}
