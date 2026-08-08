<template>
  <div class="page">
    <div class="header">
      <div class="title">F1 图表</div>
    </div>
    <div class="container">
      <Card class="card">
        <div class="subtitle">路径无法识别</div>
        <Button type="primary" @click="go">回到默认页</Button>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import { Button, Card } from "view-ui-plus";

const router = useRouter();
const go = () => router.replace("/calendar-map");
</script>
