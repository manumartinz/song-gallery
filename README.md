# music.manuelmartinez.ar

Una galería para escuchar playlists y álbumes de Spotify. No es un reproductor:
suenan fragmentos de 30 segundos, y la selección es mía.

<https://music.manuelmartinez.ar>

## Cómo funciona

Los metadatos vienen de la API de Spotify a través de una función serverless.
Spotify ya no expone previews de audio, así que se resuelven aparte por ISRC en
Deezer, con iTunes de reserva.

La lista aparece en cuanto responde Spotify; los previews van llegando después
por tramos, para no esperar a doscientas resoluciones antes de pintar nada.

El volumen vive en la barra de arriba y se recuerda en el navegador. Abre a un
sexto y va por debajo del techo del reproductor: los previews llegan
normalizados muy arriba, así que el 100% del mando no es el 100% del audio. Con
teclado, `+` y `-` mueven y `m` silencia. En Safari de iOS `volume` es de sólo
lectura, así que allí el nivel viaja por una ganancia de Web Audio —el mismo
grafo del ecualizador—, que de paso le devuelve el crossfade.

El fondo difuminado se calcula en un canvas a partir de la portada. Está hecho a
mano en JavaScript (`src/lib/blurArt.js`) porque `filter: blur()` en CSS se
rasteriza a la escala final y hundía los fotogramas al reproducir.

Un álbum entra al motor disfrazado de playlist: `/api/album` devuelve la misma
forma que `/api/playlist`, así que se carga, se ordena, se busca y suena con lo
que ya había. Lo único que cambia es la cabecera y la fila, que en un disco
pierde la portada —serían catorce veces la misma— y pone el triángulo sobre el
número de pista.

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

## Álbumes

Están en `src/config/albums.js`, y sólo ahí: desde la web no se pueden añadir, a
diferencia de las playlists. El rótulo se escribe a mano, como en
`playlists.js`; no se le piden los nombres a Spotify porque son cuatro textos
que no cambian y sería una petición por visita para escribir algo que ya está en
el repo.

Se ven como rótulos sueltos bajo un «Álbumes favoritos», sin caja, flotando a
media altura del lado izquierdo. No empujan nada: la página queda igual que sin
ellos y ocupan margen que de otro modo está muerto. El corte está en 1320 px,
que es cuando ese margen da de sí; por debajo pasan al flujo, como una tira
encima de las canciones.

Llevan su aviso de primera visita, igual que el menú de arriba. Va detrás del
otro a propósito: si el de las playlists sale en esa misma carga, éste espera a
la siguiente, que dos globos juntos molestan más de lo que explican. Los dos
vuelven con `Ctrl+Shift+R`.

Se comparten con `?a=`, igual que las playlists con `?p=`. Los dos son
excluyentes: al cambiar de una cosa a otra se borra el parámetro que sobra, o al
recargar volvería lo que se acaba de dejar.

## Desplegar

Vercel. Las variables `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` van en los
ajustes del proyecto.
