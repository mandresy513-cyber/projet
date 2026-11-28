package com.boxiby.app

import android.content.Intent
import android.os.Bundle
import android.view.animation.AnimationUtils
import android.widget.ImageView
import androidx.appcompat.app.AppCompatActivity

class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        val logo = findViewById<ImageView>(R.id.splash_logo)
        try {
            val anim = AnimationUtils.loadAnimation(this, android.R.anim.fade_in).apply { duration = 900 }
            logo.startAnimation(anim)
        } catch (_: Exception) {
        }

        logo.postDelayed({
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }, 2200)
    }
}
