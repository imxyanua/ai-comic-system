import { buildZip, crc32 } from "./zip";

function readEntries(zip: Buffer): { name: string; data: Buffer; crc: number }[] {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let pointer = zip.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    expect(zip.readUInt32LE(pointer)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(pointer + 16);
    const size = zip.readUInt32LE(pointer + 24);
    const nameLength = zip.readUInt16LE(pointer + 28);
    const localOffset = zip.readUInt32LE(pointer + 42);
    const name = zip.subarray(pointer + 46, pointer + 46 + nameLength).toString("utf8");
    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50);
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26);
    entries.push({ name, data: zip.subarray(dataStart, dataStart + size), crc });
    pointer += 46 + nameLength;
  }
  return entries;
}

describe("crc32", () => {
  it("khớp giá trị chuẩn", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe("buildZip", () => {
  it("giữ đúng thứ tự, tên và nội dung", () => {
    const entries = [
      { name: "01-01.png", data: Buffer.from("first") },
      { name: "01-02.png", data: Buffer.from("second") },
      { name: "02-01.png", data: Buffer.alloc(0) },
    ];
    const read = readEntries(buildZip(entries));
    expect(read.map((entry) => entry.name)).toEqual(["01-01.png", "01-02.png", "02-01.png"]);
    read.forEach((entry, index) => {
      expect(entry.data.equals(entries[index].data)).toBe(true);
      expect(entry.crc).toBe(crc32(entries[index].data));
    });
  });

  it("zip rỗng chỉ có phần kết thúc", () => {
    expect(buildZip([]).length).toBe(22);
  });
});
