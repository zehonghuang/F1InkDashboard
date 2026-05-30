import { computed, ref, watch } from "vue";
import { fetchSessionMeta } from "../api";
import { parseIntOrNull } from "../utils";

export function useSessionMeta(sessionKeyRef, { pageTitle } = {}) {
  const meta = ref(null);
  const loading = ref(false);
  const error = ref("");

  const load = async (sk) => {
    if (!sk) {
      meta.value = null;
      error.value = "";
      return;
    }
    loading.value = true;
    error.value = "";
    try {
      meta.value = await fetchSessionMeta({ sessionKey: sk });
    } catch (e) {
      meta.value = null;
      error.value = String(e?.message || e);
    } finally {
      loading.value = false;
    }
  };

  watch(
    () => parseIntOrNull(sessionKeyRef?.value),
    (sk) => {
      load(sk);
    },
    { immediate: true }
  );

  const titleMain = computed(() => {
    if (meta.value?.season && meta.value?.race_name) return `${meta.value.season} ${meta.value.race_name}`;
    const sk = parseIntOrNull(sessionKeyRef?.value);
    return sk ? `Session ${sk}` : "";
  });

  const titleSub = computed(() => {
    const sess = meta.value?.session_name_cn || meta.value?.session_name_en || "";
    if (sess) return sess;
    return pageTitle || "";
  });

  return { meta, loading, error, titleMain, titleSub, reload: load };
}
