import { envar, parseEnvInt } from "../util/envar";

export const env = envar([
  ["MQTT_BROKER_URI", { required: true }],
  ["MQTT_BROKER_USER"],
  ["MQTT_BROKER_PASS"],
  ["MEMGRAPH_URI", { required: true }],
  ["MEMGRAPH_USER", { required: true }],
  ["MEMGRAPH_PASS", { required: true }],
  ["MEMGRAPH_DB_NAME", { required: true }],
  ["PORT", { parser: parseEnvInt, default: 4000, required: true }],
  [
    "NODE_ENV",
    {
      required: true,
      parser: (v: string | undefined): "development" | "production" => {
        if (v !== "development" && v !== "production")
          throw new Error(`Unexpected value for NODE_ENV: ${v}`);

        return v;
      },
      default: "development",
    },
  ],
] as const);
