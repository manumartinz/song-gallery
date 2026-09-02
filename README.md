# music.manuelmartinez.ar

Una galería para escuchar playlists de Spotify. No es un reproductor: suenan
fragmentos de 30 segundos, y la selección es mía.

<https://music.manuelmartinez.ar>

## Cómo funciona

Los metadatos vienen de la API de Spotify a través de una función serverless.
Spotify ya no expone previews de audio, así que se resuelven aparte por ISRC en
Deezer, con iTunes de reserva.

La lista aparece en cuanto responde Spotify; los previews van llegando después
por tramos, para no esperar a doscientas resoluciones antes de pintar nada.

El fondo difuminado se calcula en un canvas a partir de la portada. Está hecho a
mano en JavaScript (`src/lib/blurArt.js`) porque `filter: blur()` en CSS se
rasteriza a la escala final y hundía los fotogramas al reproducir.

React y Vite. Sin dependencias de cliente más allá de React.

## Correrlo

```bash
npm install
cp .env.example .env.local   # y poné tus credenciales de Spotify
npm run dev
```

Las credenciales salen de [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard):
creá una app y copiá el Client ID y el Client Secret. No hace falta login de
usuario. En local, `dev-api.js` sirve las funciones de `/api`.

## Playlists

Las fijas del menú están en `src/config/playlists.js`. Sólo funcionan playlists
públicas creadas por un usuario: las de Spotify (Discover Weekly, Top 50, Radar)
están bloqueadas en la API pública.

Desde la web también se puede pegar el link de cualquier playlist con el botón
`+`; ésas se guardan en el navegador de cada visitante, que puede tener hasta
seis y quitarlas cuando quiera.

De una playlist pegada se muestran 49 canciones y una salida a Spotify para el
resto. Las del repo se ven enteras. La diferencia no es estética: resolver los
previews de una playlist ajena de 200 pistas son cinco funciones y doscientas
consultas a Deezer, y hay un límite de peticiones por IP que conviene gastar en
lo que el visitante vino a escuchar.

## Desplegar

Vercel. Las variables `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` van en los
ajustes del proyecto.
