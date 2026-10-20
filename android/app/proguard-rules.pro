# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Capacitor R8 full mode — keep annotation types (ionic-team/capacitor#8589)
-keep @interface com.getcapacitor.** { *; }

# Capawesome / Capgo / community plugins used by this app
-keep class io.capawesome.capacitorjs.plugins.** { *; }
-keep class ee.forgr.nativepurchases.** { *; }
-keep class com.capacitorjs.community.plugins.** { *; }
-keep class com.garagegenius.ai.ObdClassicBluetoothPlugin { *; }

# Preserve line numbers for crash deobfuscation
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
