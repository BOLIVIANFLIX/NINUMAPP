# Compilar NINUMAPP como app instalable (APK/IPA)

Esto genera un archivo instalable de verdad, para probar en un móvil real -- no hace
falta esperar al VPS para esto (aunque, sin el VPS, la app seguiría necesitando este
ordenador encendido para hablar con el backend; para probar solo la parte visual y de
navegación ya sirve).

## 1. Crear cuenta en Expo (gratis)

Entra en **expo.dev** → "Sign up" → crea la cuenta (puede ser con el mismo correo
del negocio).

## 2. Instalar la herramienta de compilación

```bash
npm install --global eas-cli
eas login
```

(te pedirá el usuario/contraseña de la cuenta que acabas de crear)

## 3. Vincular el proyecto

```bash
eas build:configure
```

La primera vez te preguntará cosas como el nombre del proyecto en Expo -- acepta los
valores por defecto.

## 4. Compilar la APK (Android, para probar directamente en el móvil)

```bash
eas build --platform android --profile preview
```

- La primera vez te preguntará por la firma (keystore) de la app → elige **"Generate
  new keystore"**, EAS se encarga de guardarla de forma segura.
- Tarda unos minutos (se compila en los servidores de Expo, no en este ordenador).
- Al terminar, te da un enlace para descargar el `.apk` directamente al móvil, o un
  código QR para escanear.

## 5. Instalar en el móvil

Descarga el `.apk` desde el enlace que te dé `eas build` directamente en el móvil
Android → ábrelo → Android pedirá permiso para "instalar apps de origen desconocido"
la primera vez (normal, no es la Play Store) → instalar.

## Para iPhone (más adelante)

Compilar para iOS requiere una cuenta de **Apple Developer** (99$/año) -- se deja para
cuando quieras probar en iPhone de verdad; Android no tiene ese coste.

## Actualizar la app instalada

Cada vez que se quiera una versión nueva en el móvil, repetir el paso 4
(`eas build --platform android --profile preview`) y volver a instalar el `.apk`
nuevo encima del anterior.
