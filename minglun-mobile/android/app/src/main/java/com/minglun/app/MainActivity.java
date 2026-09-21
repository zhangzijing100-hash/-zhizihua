package com.minglun.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate 之前注册本地插件
        registerPlugin(GameDataPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
