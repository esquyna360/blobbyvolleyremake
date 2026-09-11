import {
  selfId,
  strategy_default
} from "./chunk-XDJLQOG3.js";
import {
  createClient
} from "./chunk-E7KDQNNU.js";

// web/node_modules/.pnpm/trystero@0.21.8_patch_hash=0f996a67be939374c9fb8781108d984800a87165aa5490f6091c582d151f_286f6546a6b71589aa8b66317ea7a1bd/node_modules/trystero/src/supabase.js
var events = {
  broadcast: "broadcast",
  join: "join",
  sdp: "sdp"
};
var joinRoom = strategy_default({
  init: (config) => createClient(config.appId, config.supabaseKey),
  subscribe: (client, rootTopic, selfTopic, onMessage) => {
    const allChans = [];
    const ready = {};
    const waiting = {};
    let didUnsub = false;
    const subscribe = (topic, cb) => {
      if (ready[topic]) {
        cb(ready[topic]);
        return;
      }
      if (waiting[topic]) {
        waiting[topic].push(cb);
        return;
      }
      waiting[topic] = [cb];
      const open = () => {
        const chan = client.channel(topic);
        chan.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            if (didUnsub) {
              client.removeChannel(chan);
              return;
            }
            allChans.push(chan);
            ready[topic] = chan;
            const queued = waiting[topic] || [];
            delete waiting[topic];
            queued.forEach((f) => f(chan));
            return;
          }
          if (status === "CLOSED") {
            return;
          }
          await client.removeChannel(chan);
          setTimeout(open, 999);
        });
      };
      open();
    };
    const handleMessage = (peerTopic, signal) => subscribe(
      peerTopic,
      (chan) => chan.send({
        type: events.broadcast,
        event: events.sdp,
        payload: signal
      })
    );
    subscribe(
      selfTopic,
      (chan) => chan.on(
        events.broadcast,
        { event: events.sdp },
        ({ payload }) => onMessage(selfTopic, payload, handleMessage)
      )
    );
    subscribe(
      rootTopic,
      (chan) => chan.on(
        events.broadcast,
        { event: events.join },
        ({ payload }) => onMessage(rootTopic, payload, handleMessage)
      )
    );
    return () => {
      allChans.forEach((chan) => client.removeChannel(chan));
      didUnsub = true;
    };
  },
  announce: (client, rootTopic) => client.channel(rootTopic).send({
    type: events.broadcast,
    event: events.join,
    payload: { peerId: selfId }
  })
});
export {
  joinRoom,
  selfId
};
//# sourceMappingURL=trystero_supabase.js.map
