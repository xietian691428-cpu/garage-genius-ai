package com.garagegenius.ai;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must register custom plugins before BridgeActivity wires Cap plugins.
        registerPlugin(ObdClassicBluetoothPlugin.class);
        // Theme.SplashScreen + targetSdk 35: install before EdgeToEdge / super.onCreate
        // or cold start can crash (IllegalState / splash handoff).
        SplashScreen.installSplashScreen(this);
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
