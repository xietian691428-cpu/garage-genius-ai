# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Capacitor R8 full mode — keep annotation types (ionic-team/capacitor#8589)
-keepattributes *Annotation*
-keep @interface com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }

# Capawesome / Capgo / community plugins used by this app
-keep class io.capawesome.capacitorjs.plugins.** { *; }
-keep class ee.forgr.nativepurchases.** { *; }
-keep class com.capacitorjs.community.plugins.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.garagegenius.ai.ObdClassicBluetoothPlugin { *; }
-keepclassmembers class com.garagegenius.ai.ObdClassicBluetoothPlugin { *; }

# Preserve line numbers for crash deobfuscation
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
