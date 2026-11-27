package com.boxiby.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var boxErreur: LinearLayout
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val dialPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) ussdEnAttente?.let { composerUssd(it) }
            else ussdEnAttente?.let { proposerDialer(it) }
            ussdEnAttente = null
        }

    private val localisationPermission =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            val accord = result.values.any { it }
            if (accord) web.reload()
            else Toast.makeText(this, "Localisation refusée : la carte ne pourra pas vous placer.", Toast.LENGTH_LONG).show()
        }

    private val selectionFichier =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback
            filePathCallback = null
            val uris = if (result.resultCode == Activity.RESULT_OK && result.data != null)
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data) else null
            callback?.onReceiveValue(uris ?: emptyArray())
        }

    private var ussdEnAttente: String? = null

    private inner class BoxibyBridge {
        @JavascriptInterface
        fun dialUSSD(code: String) {
            lancerUssd(code)
        }

        @JavascriptInterface
        fun appeler(numero: String) {
            try {
                startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(numero))))
            } catch (_: Exception) {
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.webview)
        boxErreur = findViewById(R.id.box_erreur)
        findViewById<Button>(R.id.btn_reessayer).setOnClickListener { chargerSite() }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        web.addJavascriptInterface(BoxibyBridge(), "BoxibyAndroid")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                return when (u.scheme) {
                    "tel" -> { try { startActivity(Intent(Intent.ACTION_DIAL, u)) } catch (_: Exception) {} ; true }
                    "mailto", "sms", "whatsapp" -> { try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) {} ; true }
                    "http", "https" -> false
                    else -> true
                }
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                boxErreur.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView, url: String) {
                boxErreur.visibility = View.GONE
            }

            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                if (req.isForMainFrame) boxErreur.visibility = View.VISIBLE
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                try {
                    selectionFichier.launch(params.createIntent())
                } catch (_: Exception) {
                    filePathCallback = null
                    return false
                }
                return true
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                if (localisationAccordee()) {
                    callback.invoke(origin, true, false)
                } else {
                    localisationPermission.launch(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                    )
                    callback.invoke(origin, false, false)
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }
        }

        if (savedInstanceState == null) chargerSite()
        else web.restoreState(savedInstanceState)
    }

    private fun chargerSite() {
        boxErreur.visibility = View.GONE
        web.loadUrl(getString(R.string.site_url))
    }

    private fun localisationAccordee(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun lancerUssd(code: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED
        ) {
            ussdEnAttente = code
            dialPermission.launch(Manifest.permission.CALL_PHONE)
            return
        }
        composerUssd(code)
    }

    private fun composerUssd(code: String) {
        try {
            val uri = Uri.parse("tel:" + Uri.encode(code))
            startActivity(Intent(if (dialAccorde()) Intent.ACTION_CALL else Intent.ACTION_DIAL, uri))
        } catch (_: Exception) {
            proposerDialer(code)
        }
    }

    private fun proposerDialer(code: String) {
        try {
            startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(code))))
        } catch (_: Exception) {
            Toast.makeText(this, "Impossible d'ouvrir le composeur : composez $code", Toast.LENGTH_LONG).show()
        }
    }

    private fun dialAccorde(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
