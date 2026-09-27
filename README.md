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
teclado, `+` y `-` mueven y `m` silencia. El resto de atajos (`n`/`p` para
siguiente y anterior, `s` al azar, `/` buscar…) salen con `?`. En Safari de iOS `volume` es de sólo
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

React y Vite. Sin dependencias de cliente más allá de React (y la tipografía,
que se sirve desde la propia web).

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
encima de las canciones, en una sola fila que se desliza de lado y se centra
en lo que suena.

En móvil no están: por debajo de 720 px van dentro del desplegable de la barra
—que se abre como una hoja desde abajo, al alcance del pulgar—,
en su propio bloque bajo las playlists, y el botón pasa a decir lo que suena sea
de la clase que sea. Once nombres en mayúsculas eran siete líneas y se comían el
tercio de arriba de la pantalla antes de que asomara una canción — el mismo
problema que ya tuvieron las pestañas de playlists, y se resuelve igual. Los dos
cortes son el mismo 720 px a propósito: si no coincidieran quedaría una franja
de anchos sin álbumes en ninguna parte.

Llevan su aviso de primera visita, igual que el menú de arriba. Va detrás del
otro a propósito: si el de las playlists sale en esa misma carga, éste espera a
la siguiente, que dos globos juntos molestan más de lo que explican. Los dos
vuelven con `Ctrl+Shift+R`.

Se comparten con `?a=`, igual que las playlists con `?p=`. Los dos son
excluyentes: al cambiar de una cosa a otra se borra el parámetro que sobra, o al
recargar volvería lo que se acaba de dejar.

## Ahora suena

Con `f`, la flecha del mini o «Pantalla completa» en la ficha de la que suena,
la página se retira y queda la canción sola: portada grande, la nota si la
hay, controles y un espectro en canvas con el color de la portada. El espectro
sale del mismo analizador que el ecualizador de las filas, repartido en
cuarenta bandas casi logarítmicas; donde no hay datos (Safari de iOS) dibuja
una onda calculada. Se cierra con Escape o deslizando hacia abajo.

## Adiviná la canción

Un juego con la fuente abierta (`g`, o el botón del pie): suenan siete
segundos de una canción y se elige entre cuatro títulos; al contestar sigue
sonando y aparece la portada. Diez rondas, y al final se puede compartir el
resultado con un enlace `?juego` que abre el mismo juego a quien lo reciba.
Los siete segundos se cuentan desde que el audio suena, no desde que se pide.
Usa el mismo reproductor que la lista con claves propias (`quiz-…`), así que
mientras está abierto la lista no avanza sola ni atiende al teclado.

## Fin y radio

Cuando una playlist o un álbum suena entero, en vez de quedarse en silencio
sale un aviso: seguir con la siguiente del menú, encender la radio o volver a
empezar. La radio (`r`, o el botón del pie) sortea entre todo lo de la web:
cuatro canciones de una fuente y salta a otra. No salta en cada canción porque
cada salto carga una fuente entera con sus previews, y el límite por IP se
gastaría en minutos. Las playlists pegadas no entran: la radio es la selección
de la casa.

## Compartir

La ficha de cada canción tiene un «Compartir» que manda el link de esta web con
la canción abierta (`?p=…&t=…`), no el de Spotify. En el celu abre la hoja de
compartir del sistema; en la compu copia el link y avisa abajo.

## Historia para Instagram

La ficha y la vista «Ahora suena» tienen «Historia para Instagram»:
`/api/story` dibuja una imagen de 1080×1920 con la portada, el título, la nota
y la dirección de la web, con un degradado del color de la portada (la web se
lo pasa en `?c=`, porque en el edge no hay canvas para sacarlo). En el celu
va a la hoja de compartir, donde aparece Instagram; en la compu se descarga.
Safari pide que la hoja se abra justo después de un toque, y la imagen tarda un
par de segundos en dibujarse: si la rechaza, la imagen queda lista y el
segundo toque la comparte al instante.

## Tarjeta al compartir

Los rastreadores (WhatsApp, Twitter, Slack…) no ejecutan JavaScript, así que
hasta ahora cualquier enlace enseñaba la misma tarjeta con la firma. Ahora
`middleware.js` mira si quien pide la página es uno de ellos y si el enlace
lleva `?p=`, `?a=` o `?t=`; en ese caso le devuelve el mismo `index.html`
con el título, la descripción (la nota de la canción, si la tiene) y una imagen
de `/api/og` con la portada. A una persona no la toca. Lo que se cuenta de cada
enlace se decide en `api/_share.js`.

## Buscadores

No es una web que busque tráfico, pero lo básico está:

- `seo.js` (plugin de Vite) genera en el build `sitemap.xml` y `robots.txt`
  a partir de la config, y agrega al HTML datos estructurados (la web, quién
  la hace y sus playlists y discos) y un `<noscript>` con enlaces a cada uno:
  es lo único con contenido que ve quien no ejecuta JavaScript.
- En el navegador, el título, la descripción y la canónica siguen a la fuente
  abierta (`useDocumentMeta`), así cada playlist y disco es su propia página
  y no un duplicado de la portada.
- Para los rastreadores, el mismo `middleware.js` de las tarjetas pone la
  canónica limpia (sólo `p`, `a` y `t`) y los datos de la canción, playlist
  o disco. Googlebot y Bingbot están en su lista.

## Notas

Cada canción puede llevar una nota mía: por qué está, de dónde me viene. Se
escriben en `src/config/notes.js`, por id de pista de Spotify (el del link de
la canción, o el `?t=` de esta web cuando suena), así que la nota la acompaña
en cualquier playlist o álbum. Sale arriba de su ficha, y la fila lleva unas
comillas para que se note que hay algo que leer. El buscador también mira las
notas.

## Reacciones

En la ficha y en «Ahora suena» hay un corazón y un «No la conocía», con su
cuenta. El segundo es el que me importa: dice qué descubre la gente. Se guardan
en un Redis de Upstash (`api/_kv.js`, por su API REST y sin dependencias); en
Vercel se conecta desde Storage → Marketplace → Upstash, que crea
`KV_REST_API_URL` y `KV_REST_API_TOKEN`. Sin esas variables el GET responde
204 y los botones no aparecen. No hay cuentas: cada navegador recuerda lo que
marcó, y un límite por IP guardado en el propio Redis frena el abuso.

## Recomendame una

Al pie, debajo de la nota que invita a recomendar, hay un botón que abre en un
modal un formulario para que quien escucha me deje una canción (un link o
«canción — artista»), su nombre, que es obligatorio, y un mensaje si quiere.
Va al mismo Redis que las reacciones, a una lista `recs` con las 2000 más
recientes, y se leen con `npm run recs` (toma las variables de `.env.local`).
Sin Redis, el botón no sale.

Es lo único que escribe texto libre de desconocidos, así que va con capas
(`api/recommend.js` y `api/_recommendation.js`):

- Sólo desde la propia web y en JSON: un formulario de otro sitio no puede
  postear.
- Trampas para bots: un campo invisible y un mínimo de tres segundos entre
  abrir el modal y enviar. A un bot se le contesta que sí y no se guarda nada.
- Validación: largos máximos, nombre obligatorio y que no sea un link, sin HTML,
  como mucho dos links en total.
- Límites en Redis: 3 por hora y 8 por día por IP, y 150 por día en total.
  Ese último es el techo de lo que puede crecer la lista aunque lleguen desde
  muchas IPs, y cuando se alcanza queda en los logs.
- La misma canción dos veces en un día (con otro `?si=` u otra ortografía)
  cuenta una.

Las que me gustan van a una playlist pública de Spotify, y nada entra solo. Se
decide en **`/admin`**, un panel con contraseña que anda también en el celular:

- **Nuevas / Agregadas / Descartadas**: cada recomendación con su nombre,
  mensaje y la canción resuelta. Si trae link de Spotify va esa; si es texto se
  busca, y si es un video de YouTube se busca por su título. Se elige entre los
  candidatos (con preview para escuchar), o se pega el link correcto, y se
  agrega o se descarta. Descartar no borra: se puede restaurar.
- **Playlist**: lo que ya está adentro, con quién lo recomendó, para mover o
  quitar. Quitar una devuelve su recomendación a «Nuevas».

Todo pasa por una sola función, `api/admin.js` (el plan de Vercel limita
cuántas hay por deploy), con la lógica en `api/_recs.js`. La sesión es una
cookie firmada con una clave derivada de `ADMIN_PASSWORD`: cambiar la
contraseña cierra todas. La cookie solo viaja a `/api/admin`, es `HttpOnly` y
`SameSite=Strict`, y el login admite 5 intentos cada 15 minutos por IP. Sin
`ADMIN_PASSWORD` o sin Redis, el panel no existe. La página tiene su propio
bundle (`admin.html`): quien visita la galería no la descarga.

Lo mismo desde la terminal: `npm run recs add <número>` (el que imprime
`npm run recs`), o `npm run recs add 3 <link>` si el buscador se equivoca.
Comparten los datos con el panel.

Necesita `SPOTIFY_RECS_PLAYLIST` (la playlist, creada a mano una vez) y el
refresh token de abajo con `playlist-modify-public` y `playlist-modify-private`:
las playlists creadas desde las apps nuevas de Spotify piden el segundo aunque
sean públicas.

## Lo que estoy escuchando

Abajo a la izquierda flota lo que suena en mi Spotify en ese momento, o lo
último que escuché (sube cuando asoma el mini para no taparlo). Es un endpoint (`/api/now`) que habla con mi cuenta
y no con el catálogo, así que necesita un refresh token mío:

1. En el dashboard de Spotify, en la app del proyecto, añadir como Redirect URI
   `http://127.0.0.1:8888/callback`.
2. `npm run spotify-token`, abrir el enlace y aceptar.
3. Poner el `SPOTIFY_REFRESH_TOKEN` que imprime en `.env.local` y en Vercel.

Sin la variable el endpoint responde 204 y la web no enseña nada. Sólo sale
título, artista, portada y enlace: nada del dispositivo ni del contexto.

## En mi Spotify

El mismo token alimenta **mi mes**, una fuente que se arma sola con lo más
escuchado en las últimas cuatro semanas (`/api/mine`, `?m=top` en la URL). Va
en la cara de playlists, primero y en el color de la canción que suena.

Pide el permiso `user-top-read`, y sólo sale en el menú si el token lo tiene:
con uno sacado antes, hay que volver a correr `npm run spotify-token`.

## Desplegar

Vercel. Las variables `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` van en los
ajustes del proyecto.

Los errores de las funciones salen en los logs de Vercel como una línea JSON
(`api/_log.js`), con `level` `error` para los 5xx y `warn` para los 4xx: se
puede filtrar por `"level":"error"` y montar una alerta sobre eso.

La analítica es Microsoft Clarity, y solo se activa si hay `VITE_CLARITY_ID` en
el build de producción (en `npm run dev` nunca graba). Va sin cookies: se
desactivan en el panel de Clarity, en Settings → Setup → Advanced.
