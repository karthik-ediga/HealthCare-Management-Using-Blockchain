const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const port = Number(requiredEnv("DB_PORT"));

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DB_PORT must be a valid TCP port number.");
}

const caPath = process.env.DB_SSL_CA_PATH?.trim();
let ssl = undefined;
if (caPath) {
  const projectRoot = path.resolve(__dirname, "..");
  const caFile = path.isAbsolute(caPath) ? caPath : path.resolve(projectRoot, caPath);
  ssl = {
    ca: fs.readFileSync(caFile),
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
  };
} else if (
  process.env.DB_SSL === "true" ||
  (process.env.DB_HOST && !["localhost", "127.0.0.1"].includes(process.env.DB_HOST))
) {
  ssl = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true"
  };
}

const dbConfig = {
  host: requiredEnv("DB_HOST"),
  user: requiredEnv("DB_USER"),
  password: requiredEnv("DB_PASSWORD"),
  database: requiredEnv("DB_NAME"),
  port,
  ...(ssl ? { ssl } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "+00:00"
};

const pool = mysql.createPool(dbConfig);

module.exports = {
  pool,
  dbConfig
};
