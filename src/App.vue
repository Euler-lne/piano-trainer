<template>
  <n-dialog-provider>
    <n-message-provider>
      <n-config-provider :theme-overrides="themeOverrides">
        <HomeView />
      </n-config-provider>
    </n-message-provider>
  </n-dialog-provider>
</template>

<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NDialogProvider } from 'naive-ui';
import HomeView from '@/views/HomeView.vue';

const themeOverrides = {
  common: {
    primaryColor: '#1890ff',
    primaryColorHover: '#40a9ff',
  },
};
</script>