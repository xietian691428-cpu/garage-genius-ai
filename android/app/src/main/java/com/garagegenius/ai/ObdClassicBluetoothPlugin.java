package com.garagegenius.ai;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Classic Bluetooth RFCOMM/SPP for ELM327 adapters (Android only).
 * Well-known SPP UUID — same as most ELM327 Classic dongles.
 */
@CapacitorPlugin(
    name = "ObdClassicBluetooth",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.ACCESS_FINE_LOCATION
            }
        )
    }
)
public class ObdClassicBluetoothPlugin extends Plugin {
    private static final String TAG = "ObdClassicBT";
    private static final UUID SPP_UUID =
        UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final Charset ASCII = Charset.forName("US-ASCII");

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean reading = new AtomicBoolean(false);

    private BluetoothSocket socket;
    private InputStream input;
    private OutputStream output;
    private BroadcastReceiver discoveryReceiver;
    private boolean discoveryRegistered = false;

    private BluetoothAdapter adapter() {
        return BluetoothAdapter.getDefaultAdapter();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        BluetoothAdapter a = adapter();
        ret.put("available", a != null);
        ret.put("enabled", a != null && a.isEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void listBonded(PluginCall call) {
        if (!ensureConnectPermission(call, "listBonded")) return;
        BluetoothAdapter a = adapter();
        if (a == null) {
            call.reject("Bluetooth is not available on this device.");
            return;
        }
        JSArray devices = new JSArray();
        try {
            @SuppressLint("MissingPermission")
            Set<BluetoothDevice> bonded = a.getBondedDevices();
            if (bonded != null) {
                for (BluetoothDevice d : bonded) {
                    devices.put(deviceJson(d));
                }
            }
        } catch (SecurityException e) {
            call.reject("Bluetooth permission denied.");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("devices", devices);
        call.resolve(ret);
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        if (!ensureScanPermission(call, "startDiscovery")) return;
        BluetoothAdapter a = adapter();
        if (a == null) {
            call.reject("Bluetooth is not available on this device.");
            return;
        }
        if (!a.isEnabled()) {
            call.reject("Bluetooth is off. Turn Bluetooth on and try again.");
            return;
        }
        registerDiscoveryReceiver();
        try {
            @SuppressLint("MissingPermission")
            boolean started = a.startDiscovery();
            if (!started) {
                call.reject("Could not start Bluetooth discovery.");
                return;
            }
        } catch (SecurityException e) {
            call.reject("Bluetooth permission denied.");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a != null) {
            try {
                @SuppressLint("MissingPermission")
                boolean ignored = a.cancelDiscovery();
            } catch (SecurityException ignored) {
                /* best effort */
            }
        }
        unregisterDiscoveryReceiver();
        call.resolve();
    }

    @PluginMethod
    public void connect(PluginCall call) {
        if (!ensureConnectPermission(call, "connect")) return;
        String address = call.getString("address");
        if (address == null || address.isEmpty()) {
            call.reject("Missing Bluetooth address.");
            return;
        }
        boolean insecure = Boolean.TRUE.equals(call.getBoolean("insecure", false));
        BluetoothAdapter a = adapter();
        if (a == null) {
            call.reject("Bluetooth is not available on this device.");
            return;
        }
        try {
            @SuppressLint("MissingPermission")
            boolean cancelled = a.cancelDiscovery();
        } catch (SecurityException ignored) {
            /* ok */
        }
        unregisterDiscoveryReceiver();

        io.execute(() -> {
            closeSocketQuietly();
            try {
                @SuppressLint("MissingPermission")
                BluetoothDevice device = a.getRemoteDevice(address);
                @SuppressLint("MissingPermission")
                BluetoothSocket sock = insecure
                    ? device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)
                    : device.createRfcommSocketToServiceRecord(SPP_UUID);
                sock.connect();
                socket = sock;
                input = sock.getInputStream();
                output = sock.getOutputStream();
                reading.set(true);
                startReadLoop();
                main.post(call::resolve);
            } catch (SecurityException e) {
                closeSocketQuietly();
                main.post(() -> call.reject("Bluetooth permission denied."));
            } catch (IOException e) {
                closeSocketQuietly();
                // Many ELM clones only accept insecure RFCOMM.
                if (!insecure) {
                    tryInsecure(call, a, address);
                    return;
                }
                main.post(() ->
                    call.reject(
                        e.getMessage() != null
                            ? e.getMessage()
                            : "Classic Bluetooth connect failed."
                    )
                );
            } catch (IllegalArgumentException e) {
                closeSocketQuietly();
                main.post(() -> call.reject("Invalid Bluetooth address."));
            }
        });
    }

    private void tryInsecure(PluginCall call, BluetoothAdapter a, String address) {
        try {
            @SuppressLint("MissingPermission")
            BluetoothDevice device = a.getRemoteDevice(address);
            @SuppressLint("MissingPermission")
            BluetoothSocket sock = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
            sock.connect();
            socket = sock;
            input = sock.getInputStream();
            output = sock.getOutputStream();
            reading.set(true);
            startReadLoop();
            main.post(call::resolve);
        } catch (Exception e2) {
            closeSocketQuietly();
            main.post(() ->
                call.reject(
                    e2.getMessage() != null
                        ? e2.getMessage()
                        : "Classic Bluetooth connect failed."
                )
            );
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeSocketQuietly();
        call.resolve();
    }

    @PluginMethod
    public void write(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Missing data.");
            return;
        }
        OutputStream out = output;
        if (out == null || socket == null || !socket.isConnected()) {
            call.reject("Not connected.");
            return;
        }
        io.execute(() -> {
            try {
                out.write(data.getBytes(ASCII));
                out.flush();
                main.post(call::resolve);
            } catch (IOException e) {
                closeSocketQuietly();
                notifyDisconnected();
                main.post(() -> call.reject("Write failed — adapter disconnected."));
            }
        });
    }

    private void startReadLoop() {
        io.execute(() -> {
            byte[] buf = new byte[512];
            while (reading.get()) {
                InputStream in = input;
                if (in == null) break;
                try {
                    int n = in.read(buf);
                    if (n < 0) {
                        closeSocketQuietly();
                        notifyDisconnected();
                        break;
                    }
                    if (n == 0) continue;
                    String chunk = new String(buf, 0, n, ASCII);
                    JSObject ret = new JSObject();
                    ret.put("data", chunk);
                    main.post(() -> notifyListeners("data", ret));
                } catch (IOException e) {
                    if (reading.get()) {
                        closeSocketQuietly();
                        notifyDisconnected();
                    }
                    break;
                }
            }
        });
    }

    private void notifyDisconnected() {
        main.post(() -> notifyListeners("disconnect", new JSObject()));
    }

    private void closeSocketQuietly() {
        reading.set(false);
        try {
            if (input != null) input.close();
        } catch (IOException ignored) {
        }
        try {
            if (output != null) output.close();
        } catch (IOException ignored) {
        }
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
        }
        input = null;
        output = null;
        socket = null;
    }

    @SuppressLint("MissingPermission")
    private JSObject deviceJson(BluetoothDevice d) {
        JSObject o = new JSObject();
        String name = null;
        try {
            name = d.getName();
        } catch (SecurityException ignored) {
        }
        o.put("address", d.getAddress());
        o.put("name", name != null ? name : d.getAddress());
        return o;
    }

    private void registerDiscoveryReceiver() {
        if (discoveryRegistered) return;
        discoveryReceiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String action = intent.getAction();
                    if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                        BluetoothDevice device =
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                        if (device == null) return;
                        short rssi =
                            intent.getShortExtra(
                                BluetoothDevice.EXTRA_RSSI,
                                Short.MIN_VALUE
                            );
                        JSObject o = deviceJson(device);
                        if (rssi != Short.MIN_VALUE) o.put("rssi", (int) rssi);
                        notifyListeners("deviceFound", o);
                    } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                        notifyListeners("discoveryFinished", new JSObject());
                        unregisterDiscoveryReceiver();
                    }
                }
            };
        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext()
                .registerReceiver(
                    discoveryReceiver,
                    filter,
                    Context.RECEIVER_NOT_EXPORTED
                );
        } else {
            getContext().registerReceiver(discoveryReceiver, filter);
        }
        discoveryRegistered = true;
    }

    private void unregisterDiscoveryReceiver() {
        if (!discoveryRegistered || discoveryReceiver == null) return;
        try {
            getContext().unregisterReceiver(discoveryReceiver);
        } catch (IllegalArgumentException e) {
            Log.w(TAG, "discovery receiver already unregistered");
        }
        discoveryReceiver = null;
        discoveryRegistered = false;
    }

    private boolean ensureConnectPermission(PluginCall call, String method) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        if (getPermissionState("bluetooth") == com.getcapacitor.PermissionState.GRANTED) {
            return true;
        }
        requestPermissionForAlias("bluetooth", call, "bluetoothPermsCallback");
        return false;
    }

    private boolean ensureScanPermission(PluginCall call, String method) {
        return ensureConnectPermission(call, method);
    }

    @PermissionCallback
    private void bluetoothPermsCallback(PluginCall call) {
        if (getPermissionState("bluetooth") == com.getcapacitor.PermissionState.GRANTED) {
            // Capacitor keeps the original call data — re-run connect when address present.
            if (call.getString("address") != null) {
                connect(call);
            } else {
                listBonded(call);
            }
        } else {
            call.reject("Bluetooth permission denied.");
        }
    }

    @Override
    protected void handleOnDestroy() {
        unregisterDiscoveryReceiver();
        closeSocketQuietly();
        io.shutdownNow();
        super.handleOnDestroy();
    }
}
