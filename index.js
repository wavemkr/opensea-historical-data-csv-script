import { config } from "dotenv-flow";
import fs, { promises } from "fs";
import fetch from "node-fetch";

config();

export const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const THROTTLED_REGEX =
  /Request was throttled\.( Expected available in ([0-9]*) second)?/;

const OPENSEA_URL =
  "https://api.opensea.io/api/v1/events?only_opensea=false&event_type=successful";

const MINUTES = 0.5;
const LOG_INTERVAL = 60000 * MINUTES;
const ONE_DAY = 86400000;

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

  const dt =
    now.toLocaleDateString().replace(/\//g, "-") +
    "_" +
    now
      .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      .replace(":", "-")
      .replace(" ", "");

  if (slug) {
    requestUrl += `&collection_slug=${slug}`;
    if (!filename) {
      filename = `${slug}_${dt}.csv`;
    }
  } else if (contract) {
    requestUrl += `&asset_contract_address=${contract}`;

    if (!filename) {
      filename = `${contract}_${dt}.csv`;
    }
  } else {
    console.error(
      "This script requires either a `--slug` or `--contract` parameter to be passed."
    );
    process.exit(1);
  }

  if (since) {
    requestUrl += `&occurred_after=${since}`;
  }

  if (!filename?.endsWith(".csv")) filename += ".csv";

  let cont = true;
  let i = 0;
  let j = 0;
  let k = 0;
  let cursor = "";
  let failedAttempts = 0;
  const result = {};

  setInterval(() => {
    const minutesDuration = ++k * MINUTES;
    console.info(
      `${minutesDuration} minutes passed. ${i} tx processed (~${Math.round(
        i / minutesDuration
      )} / min) in ${j} requests (~${Math.round(j / minutesDuration)} / min).`
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
        const msToWait = (parseInt(secs) ?? 10) * 1010;
        console.info(`Opensea API rate limited. Retrying in ${secs} seconds.`);
        await sleep(msToWait);
      } else {
        if (j === 0 && asset_events.length) {
          collectionName = asset_events[0].asset_contract.name;
        }
        j++;
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
            i++;
          }
        );
        if (!cursor) {
          cont = false;
        } else {
          failedAttempts = 0;
        }
      }
    } catch (e) {
      failedAttempts++;
      if (failedAttempts >= 5) {
        console.error("An unexpected error occurred requesting Opensea data.");
        console.error(e.message);
        process.exit(1);
      } else {
        const wait = 1000 * failedAttempts;
        await sleep(wait);
        console.error(
          `Error fetching Opensea data x${failedAttempts}. Retrying in ${
            wait / 1000
          } seconds.`
        );
      }
    }
  } while (cont);

  const file = Object.entries(result).reduce((acc, [date, prices]) => {
    const volume = prices.reduce((sum, val) => sum + val, 0);
    const avgPrice =
      Math.round((volume / prices.length + Number.EPSILON) * 100) / 100;
    const floor = Math.min(...prices);

    return acc + `${date},${volume},${avgPrice},${floor},${prices.length}\n`;
  }, 'Date,Volume,"Avg Price",Floor,"Num Sales"\n');

  if (!fs.existsSync("./output")) {
    await promises.mkdir("./output");
  }

  await promises.writeFile(`output/${filename}`, file);
  console.info(`Written to output/${filename}`);
  process.exit(0);
};

go();
