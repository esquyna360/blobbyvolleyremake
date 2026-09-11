import {
  entries,
  fromEntries,
  fromJson,
  genId,
  getRelays,
  libName,
  makeSocket,
  selfId,
  sha1,
  socketGetter,
  strategy_default,
  toJson
} from "./chunk-XDJLQOG3.js";

// web/node_modules/.pnpm/trystero@0.21.8_patch_hash=0f996a67be939374c9fb8781108d984800a87165aa5490f6091c582d151f_286f6546a6b71589aa8b66317ea7a1bd/node_modules/trystero/src/torrent.js
var clients = {};
var topicToInfoHash = {};
var infoHashToTopic = {};
var announceIntervals = {};
var announceFns = {};
var trackerAnnounceMs = {};
var handledOffers = {};
var msgHandlers = {};
var trackerAction = "announce";
var hashLimit = 20;
var offerPoolSize = 10;
var defaultAnnounceMs = 33333;
var maxAnnounceMs = 120333;
var defaultRedundancy = 3;
var getInfoHash = async (topic) => {
  if (topicToInfoHash[topic]) {
    return topicToInfoHash[topic];
  }
  const hash = (await sha1(topic)).slice(0, hashLimit);
  topicToInfoHash[topic] = hash;
  infoHashToTopic[hash] = topic;
  return hash;
};
var send = async (client, topic, payload) => client.send(
  toJson({
    action: trackerAction,
    info_hash: await getInfoHash(topic),
    peer_id: selfId,
    ...payload
  })
);
var warn = (url, msg, didFail) => console.warn(
  `${libName}: torrent tracker ${didFail ? "failure" : "warning"} from ${url} - ${msg}`
);
var joinRoom = strategy_default({
  init: (config) => getRelays(config, defaultRelayUrls, defaultRedundancy).map((rawUrl) => {
    const client = makeSocket(rawUrl, (rawData) => {
      const data = fromJson(rawData);
      const errMsg = data["failure reason"];
      const warnMsg = data["warning message"];
      const { interval } = data;
      const topic = infoHashToTopic[data.info_hash];
      if (errMsg) {
        warn(url, errMsg, true);
        return;
      }
      if (warnMsg) {
        warn(url, warnMsg);
      }
      if (interval && interval * 1e3 > trackerAnnounceMs[url] && announceFns[url][topic]) {
        const int = Math.min(interval * 1e3, maxAnnounceMs);
        clearInterval(announceIntervals[url][topic]);
        trackerAnnounceMs[url] = int;
        announceIntervals[url][topic] = setInterval(
          announceFns[url][topic],
          int
        );
      }
      if (handledOffers[data.offer_id]) {
        return;
      }
      if (data.offer || data.answer) {
        handledOffers[data.offer_id] = true;
        msgHandlers[url][topic]?.(data);
      }
    });
    const { url } = client;
    clients[url] = client;
    msgHandlers[url] = {};
    return client.ready;
  }),
  subscribe: (client, rootTopic, _, onMessage, getOffers) => {
    const { url } = client;
    const announce = async () => {
      const offers = fromEntries(
        (await getOffers(offerPoolSize)).map((peerAndOffer) => [
          genId(hashLimit),
          peerAndOffer
        ])
      );
      msgHandlers[client.url][rootTopic] = (data) => {
        if (data.offer) {
          onMessage(
            rootTopic,
            { offer: data.offer, peerId: data.peer_id },
            (_2, signal) => send(client, rootTopic, {
              // certain trackers will reject if answer contains extra fields
              answer: fromJson(signal).answer,
              offer_id: data.offer_id,
              to_peer_id: data.peer_id
            })
          );
        } else if (data.answer) {
          const offer = offers[data.offer_id];
          if (offer) {
            onMessage(rootTopic, {
              answer: data.answer,
              peerId: data.peer_id,
              peer: offer.peer
            });
          }
        }
      };
      send(client, rootTopic, {
        numwant: offerPoolSize,
        offers: entries(offers).map(([id, { offer }]) => ({ offer_id: id, offer }))
      });
    };
    trackerAnnounceMs[url] = defaultAnnounceMs;
    announceFns[url] ||= {};
    announceFns[url][rootTopic] = announce;
    announceIntervals[url] ||= {};
    announceIntervals[url][rootTopic] = setInterval(
      announce,
      trackerAnnounceMs[url]
    );
    announce();
    return () => {
      clearInterval(announceIntervals[url][rootTopic]);
      delete msgHandlers[url][rootTopic];
      delete announceFns[url][rootTopic];
    };
  },
  announce: (client) => trackerAnnounceMs[client.url]
});
var getRelaySockets = socketGetter(clients);
var defaultRelayUrls = [
  "tracker.webtorrent.dev",
  "tracker.openwebtorrent.com",
  "tracker.btorrent.xyz",
  "tracker.files.fm:7073/announce"
].map((url) => "wss://" + url);
export {
  defaultRelayUrls,
  getRelaySockets,
  joinRoom,
  selfId
};
//# sourceMappingURL=trystero_torrent.js.map
