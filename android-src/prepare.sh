#!/usr/bin/env bash
# Adatta il progetto Android generato da Capacitor: icone, avvio, permessi, versione.
# Uso: android-src/prepare.sh <numero-versione>
set -euo pipefail
N="${1:?numero versione}"
SRC="$(cd "$(dirname "$0")" && pwd)"
APP=android/app
RES=$APP/src/main/res

# Icone e colore di sfondo dell'icona adattiva
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do cp "$SRC/res/mipmap-$d/"*.png "$RES/mipmap-$d/"; done
cp "$SRC/res/values/ic_launcher_background.xml" "$RES/values/ic_launcher_background.xml"

# Schermata di avvio: sostituisce l'immagine di esempio in tutte le densità
find "$RES" -name 'splash.png' -exec cp "$SRC/res/splash.png" {} \;

# Permessi posizione (la richiesta compare solo quando tocchi "La mia posizione")
MAN=$APP/src/main/AndroidManifest.xml
grep -q ACCESS_FINE_LOCATION "$MAN" || sed -i 's#</manifest>#    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>#' "$MAN"

# Navigazione: vibrazione e avvisi di discesa programmati (anche a schermo spento)
for P in "android.permission.VIBRATE" "android.permission.POST_NOTIFICATIONS" "android.permission.USE_EXACT_ALARM"; do
  grep -q "$P\"" "$MAN" || sed -i "s#</manifest>#    <uses-permission android:name=\"$P\" />\n</manifest>#" "$MAN"
done
grep -q "SCHEDULE_EXACT_ALARM" "$MAN" || sed -i 's#</manifest>#    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />\n</manifest>#' "$MAN"

# Bordo a bordo, come consigliato da Capacitor 8 con insetsHandling "native".
# Va chiamato DOPO super.onCreate: prima il tema senza barra non è ancora attivo
# e Android crea una barra del titolo (con lo sfondo della schermata di avvio).
MA=$(find $APP/src/main/java -name MainActivity.java)
cat > "$MA" <<JAVA
package io.github.rex11107.girovia;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getSupportActionBar() != null) getSupportActionBar().hide();
        EdgeToEdge.enable(this);
    }
}
JAVA

# Versione: aumenta a ogni compilazione, così Android accetta l'aggiornamento
sed -i -E "s/versionCode [0-9]+/versionCode $N/; s/versionName \"[^\"]*\"/versionName \"0.1.$N\"/" $APP/build.gradle
grep -E "versionCode|versionName" $APP/build.gradle
