import { config } from "dotenv-flow";
import fs, { promises } from "fs";
import fetch from "node-fetch";

config();

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getHMS = (ms) => {
  let seconds = ms / 1000;
  // 2- Extract hours:
  const hours = parseInt(seconds / 3600); // 3,600 seconds in 1 hour
  seconds = seconds % 3600; // seconds remaining after extracting hours
  // 3- Extract minutes:
  const minutes = parseInt(seconds / 60); // 60 seconds in 1 minute
  // 4- Keep only seconds not extracted to minutes:
  seconds = parseInt(seconds % 60);

  return { hours, minutes, seconds };
};

const SPACES = " ".repeat(40);

const THROTTLED_REGEX =
  /Request was throttled\.( Expected available in ([0-9]*) second)?/;

const OPENSEA_URL =
  "https://api.opensea.io/api/v1/events?only_opensea=false&event_type=successful";

const MINUTES = 1 / 120;
const LOG_INTERVAL = 60000 * MINUTES;
const ONE_DAY = 86400000;
const DOTS = "▏▎▍▋▊▉";

let cachedHeaders;

const getOpenseaHeaders = () => {
  if (cachedHeaders) return cachedHeaders;
  return (cachedHeaders = {
    "X-API-KEY": String(process.env.OPENSEA_API_KEY),
  });
};

const go = async () => {
  const {
    npm_config_slug: slug,
    npm_config_contract: contract,
    npm_config_outputFilename: outputFilename,
    npm_config_daysback: days,
  } = process.env;

  console.info(
    `Requesting data from Opensea for "${slug || contract}"${
      days ? ` from the last ${days} days` : " for all time."
    }`
  );

  let requestUrl = OPENSEA_URL;
  let filename = outputFilename;

  const now = new Date();

  const since = Math.floor((now.getTime() - days * ONE_DAY) / 1000);

  if (slug) {
    requestUrl += `&collection_slug=${slug}`;
  } else if (contract) {
    requestUrl += `&asset_contract_address=${contract}`;
  } else {
    console.error(
      "This script requires either a `--slug` or `--contract` parameter to be passed."
    );
    process.exit(1);
  }

  if (since) {
    requestUrl += `&occurred_after=${since}`;
  }

  const result = {};
  const startTime = Date.now();

  let loop = true;
  let cursor = "";
  let txCount = 0;
  let reqCount = 0;
  let intervalCount = 0;
  let failedAttempts = 0;

  setInterval(() => {
    const duration = Date.now() - startTime;
    const { minutes, seconds } = getHMS(duration);
    const fullMins = duration / 1000 / 60;

    process.stdout.write(
      `${`${DOTS.charAt(++intervalCount % DOTS.length)} ${"0".repeat(
        Math.max(2 - String(minutes).length, 0)
      )}${minutes}`}:${`${"0".repeat(
        Math.max(2 - String(seconds).length, 0)
      )}${seconds}`} - ${txCount} tx processed (~${Math.round(
        txCount / fullMins
      )}/min) in ${reqCount} requests (~${Math.round(
        reqCount / fullMins
      )}/min)${SPACES}\r`
    );
  }, LOG_INTERVAL);
  let collectionName;
  console.info("This can take several minutes...");
  do {
    try {
      const {
        next,
        asset_events,
        detail = "",
      } = await fetch(requestUrl + (cursor ? `&cursor=${cursor}` : ""), {
        headers: getOpenseaHeaders(),
      }).then((resp) => resp.json());

      const match = THROTTLED_REGEX.exec(detail);
      if (match) {
        const [_, secs] = match;
        const msToWait = (parseInt(secs) || 10) * 1010;
        console.info(
          `Opensea API rate limited. Retrying in ${secs} seconds.${SPACES}`
        );
        await sleep(msToWait);
      } else {
        if (reqCount === 0 && asset_events.length) {
          collectionName = asset_events[0].asset.asset_contract.name;
        }
        reqCount++;
        cursor = next;
        asset_events.forEach(
          ({
            total_price,
            event_timestamp,
            payment_token: { decimals, eth_price },
          }) => {
            const date = event_timestamp.split("T")[0];
            const priceEth = (total_price / 10 ** decimals) * Number(eth_price);

            if (!result[date]) result[date] = [priceEth];
            else result[date].push(priceEth);
            txCount++;
          }
        );
        if (!cursor) {
          loop = false;
        } else {
          failedAttempts = 0;
        }
      }
    } catch (e) {
      failedAttempts++;
      if (failedAttempts >= 5) {
        console.error(
          `An unexpected error occurred requesting Opensea data.${SPACES}`
        );
        console.error(e.message);
        process.exit(1);
      } else {
        const wait = 1000 * failedAttempts;
        await sleep(wait);
        process.stdout.write(
          ` Error fetching Opensea data x${failedAttempts}. Retrying in ${
            wait / 1000
          } seconds.${SPACES}\r`
        );
      }
    }
  } while (loop);

  let rows = 0;
  const file = Object.entries(result).reduce((acc, [date, prices]) => {
    const volume = prices.reduce((sum, val) => sum + val, 0);
    const avgPrice =
      Math.round((volume / prices.length + Number.EPSILON) * 100) / 100;
    const floor = Math.min(...prices);

    rows++;
    return acc + `${date},${volume},${avgPrice},${floor},${prices.length}\n`;
  }, 'Date,Volume,"Avg Price",Floor,"Num Sales"\n');

  if (!fs.existsSync("./output")) {
    await promises.mkdir("./output");
  }

  const dt =
    now.toLocaleDateString().replace(/\//g, "-") +
    "_" +
    now
      .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      .replace(":", "-")
      .replace(" ", "");

  if (!filename) {
    filename = `${collectionName
      .toLocaleLowerCase()
      .replace(/ /g, "-")}_${dt}.csv`;
  }
  if (!filename?.endsWith(".csv")) filename += ".csv";

  await promises.writeFile(`output/${filename}`, file);

  const duration = Date.now() - startTime;
  let seconds = duration / 1000;
  const minutes = parseInt(seconds / 60);
  seconds = Math.round(seconds % 60);

  console.info(
    `Completed in ${minutes}m ${seconds}s. ${rows} data rows written to output/${filename}${SPACES}`
  );
  process.exit(0);
};

go();
