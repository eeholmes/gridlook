<script lang="ts" setup>
import { storeToRefs } from "pinia";

import {
  toValueTransform,
  VALUE_TRANSFORM_OPTIONS,
} from "@/lib/data/valueTransform.ts";
import { useGlobeControlStore } from "@/store/store.ts";

const emit = defineEmits<{
  transformUserSelected: [];
}>();

const store = useGlobeControlStore();
const { transformMode, loading } = storeToRefs(store);

function onTransformChange(event: Event) {
  transformMode.value = toValueTransform(
    (event.target as HTMLSelectElement).value
  );
  emit("transformUserSelected");
}
</script>

<template>
  <div class="column pt-0">
    <label class="is-size-7 has-text-grey" for="transform-selector">
      Transform
    </label>
    <div class="select is-fullwidth" :class="{ 'is-loading': loading }">
      <select
        id="transform-selector"
        :value="transformMode"
        @change="onTransformChange"
      >
        <option
          v-for="option in VALUE_TRANSFORM_OPTIONS"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
    </div>
  </div>
</template>
