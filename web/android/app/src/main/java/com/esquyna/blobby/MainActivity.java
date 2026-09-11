package com.esquyna.blobby;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

/**
 * Tela cheia de verdade. Duas coisas acontecem aqui:
 *
 * As barras do sistema somem e só voltam num arrasto — senão o polegar esbarra
 * na barra de navegação no meio do rally.
 *
 * E a WebView ocupa a tela inteira, recorte de câmera incluído, em vez de ser
 * afastada dele. Quem deixava faixa preta era esse afastamento. As medidas do
 * recorte chegam no CSS como variáveis, então a interface continua fora dele
 * sem que o jogo pare de desenhar até a borda.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        bindInsets();
        immersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    private void immersive() {
        WindowInsetsControllerCompat c =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    private void bindInsets() {
        View host = (View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(host, (v, insets) -> {
            v.setPadding(0, 0, 0, 0);
            // barra some, recorte não: só o recorte precisa virar margem no CSS
            Insets cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            pushSafeArea(cut);
            return insets;
        });
    }

    private void pushSafeArea(Insets cut) {
        float d = getResources().getDisplayMetrics().density;
        String js = String.format(Locale.US,
                "document.documentElement.style.setProperty('--sa-t','%dpx');"
                        + "document.documentElement.style.setProperty('--sa-r','%dpx');"
                        + "document.documentElement.style.setProperty('--sa-b','%dpx');"
                        + "document.documentElement.style.setProperty('--sa-l','%dpx');",
                (int) (cut.top / d), (int) (cut.right / d),
                (int) (cut.bottom / d), (int) (cut.left / d));
        runOnUiThread(() -> {
            WebView w = getBridge().getWebView();
            if (w != null) w.evaluateJavascript(js, null);
        });
    }
}
