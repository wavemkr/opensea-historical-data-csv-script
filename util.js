export const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const getDuration = (startTime) => {
  const duration = Date.now() - startTime;
  let seconds = duration / 1000;
  // 2- Extract hours:
  const hours = parseInt(seconds / 3600); // 3,600 seconds in 1 hour
  seconds = seconds % 3600; // seconds remaining after extracting hours
  // 3- Extract minutes:
  const minutes = parseInt(seconds / 60); // 60 seconds in 1 minute
  // 4- Keep only seconds not extracted to minutes:
  seconds = parseInt(seconds % 60);

  return { hours, minutes, seconds, duration };
};

export const SPACES = " ".repeat(40);

export const THROTTLED_REGEX =
  /Request was throttled\.( Expected available in ([0-9]*) second)?/;

export const OPENSEA_URL =
  "https://api.opensea.io/api/v1/events?only_opensea=false&event_type=successful";

export const MINUTES = 1 / 120;
export const LOG_INTERVAL = 60000 * MINUTES;
export const ONE_DAY = 86400000;
export const DOTS = "▏▎▍▋▊▉";

let cachedHeaders;

export const getOpenseaHeaders = () => {
  if (cachedHeaders) return cachedHeaders;
  return (cachedHeaders = {
    "X-API-KEY": String(process.env.OPENSEA_API_KEY),
  });
};
