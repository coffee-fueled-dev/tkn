export interface BatchItem {
  data: string;
}

export function parseMessage(rawData: any): BatchItem[] {
  try {
    if (rawData instanceof Uint8Array) {
      const text = new TextDecoder().decode(rawData);
      return parseDelimitedText(text);
    }

    if (typeof rawData === "string") {
      return parseDelimitedText(rawData);
    } else throw new Error("Invalid data type");
  } catch (err) {
    console.error("Error parsing data to batch:", err);
    return [];
  }
}

function parseDelimitedText(text: string): BatchItem[] {
  const lines = text.split("\n").filter((line) => line.length > 0);
  return lines.map((line) => ({ data: line }));
}
