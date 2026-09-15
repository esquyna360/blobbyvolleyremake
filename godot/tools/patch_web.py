import re
import sys

ROOT = "/Users/bruno/playground/blobbyvolleyremake/godot-web"

SW = ROOT + "/index.service.worker.js"
s = open(SW).read()

start = s.index("self.addEventListener(\n\t'fetch',")
end = s.index("self.addEventListener('message'")
fetch = """self.addEventListener(
	'fetch',
	/**
	 * Rede primeiro, sempre. O cache existe so para a pagina offline: servindo
	 * do cache, o jogo abria na versao antiga e nenhum deploy chegava no
	 * celular. Os headers de isolamento continuam vindo daqui, que e o que o
	 * GitHub Pages nao manda.
	 * @param {FetchEvent} event
	 */
	(event) => {
		const isNavigate = event.request.mode === 'navigate';
		const url = event.request.url || '';
		const referrer = event.request.referrer || '';
		const base = referrer.slice(0, referrer.lastIndexOf('/') + 1);
		const local = url.startsWith(base) ? url.replace(base, '') : '';
		const isCacheable = FULL_CACHE.some((v) => v === local) || (base === referrer && base.endsWith(CACHED_FILES[0]));
		event.respondWith((async () => {
			try {
				let response = await event.preloadResponse;
				if (response == null) {
					response = await self.fetch(event.request, {cache: 'no-store'});
				}
				if (ENSURE_CROSSORIGIN_ISOLATION_HEADERS) {
					response = ensureCrossOriginIsolationHeaders(response);
				}
				if (isCacheable && response.ok) {
					const cache = await caches.open(CACHE_NAME);
					cache.put(event.request, response.clone());
				}
				return response;
			} catch (e) {
				const cache = await caches.open(CACHE_NAME);
				let cached = await cache.match(event.request);
				if (cached == null && isNavigate) {
					cached = await caches.match(OFFLINE_URL);
				}
				if (cached == null) {
					throw e;
				}
				if (ENSURE_CROSSORIGIN_ISOLATION_HEADERS) {
					cached = ensureCrossOriginIsolationHeaders(cached);
				}
				return cached;
			}
		})());
	}
);

"""
s = s[:start] + fetch + s[end:]
s = s.replace(
	"event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHED_FILES)));",
	"self.skipWaiting();\n\tevent.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHED_FILES)));")
s = s.replace(
	"return ('navigationPreload' in self.registration) ? self.registration.navigationPreload.enable() : Promise.resolve();",
	"return self.clients.claim();")
open(SW, "w").write(s)

HTML = ROOT + "/index.html"
h = open(HTML).read()
h = re.sub(r'<script>if\("serviceWorker" in navigator\).*?</script>\n', "", h, flags=re.S)

# Com um service worker ja registrado mas sem isolamento, o Godot desiste com
# "Service worker already exists" e deixa a tela de erro na cara do jogador.
# Aqui ele atualiza o worker antigo e recarrega uma vez -- e o que faltava pra
# um deploy novo chegar em quem ja tinha aberto o jogo.
old_sw = """				serviceWorkerRegistrationPromise.then((registration) => {
					if (registration != null) {
						return Promise.reject(new Error('Service worker already exists.'));
					}
					return registration;
				}).then(() => engine.installServiceWorker()),"""
new_sw = """				serviceWorkerRegistrationPromise.then((registration) => {
					if (registration != null) {
						if (sessionStorage.getItem('blorp_sw_retry')) {
							return Promise.reject(new Error('Service worker already exists.'));
						}
						sessionStorage.setItem('blorp_sw_retry', '1');
						return registration.update().catch(() => null);
					}
					return engine.installServiceWorker();
				}),"""
assert old_sw in h, "trecho do service worker nao encontrado no index.html"
h = h.replace(old_sw, new_sw, 1)
open(HTML, "w").write(h)
print("patch_web ok")
