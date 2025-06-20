export interface BatchItem {
  data: string | Uint8Array;
}

export function parseToBatch(rawData: any): BatchItem[] {
  try {
    if (
      Array.isArray(rawData) &&
      rawData.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "data" in item &&
          (typeof item.data === "string" || item.data instanceof Uint8Array)
      )
    ) {
      return rawData as BatchItem[];
    }

    if (rawData instanceof Uint8Array) {
      try {
        const jsonStr = new TextDecoder().decode(rawData);
        const parsed = JSON.parse(jsonStr);
        return convertToBatch(parsed);
      } catch {
        return [{ data: rawData }];
      }
    }

    if (typeof rawData === "string") {
      try {
        const parsed = JSON.parse(rawData);
        return convertToBatch(parsed);
      } catch {
        return [{ data: rawData }];
      }
    }

    return convertToBatch(rawData);
  } catch (err) {
    console.error("Error parsing data to batch:", err);
    return [{ data: String(rawData) }];
  }
}

function convertToBatch(data: any): BatchItem[] {
  if (Array.isArray(data)) {
    return data.map((item) => ({
      data: typeof item === "string" ? item : JSON.stringify(item),
    }));
  }

  if (typeof data === "string" || data instanceof Uint8Array) {
    return [{ data }];
  }

  return [{ data: JSON.stringify(data) }];
}
