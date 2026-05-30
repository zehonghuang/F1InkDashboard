import { ref } from "vue";
import { fetchAvailableDrivers } from "../api";

const cache = ref(null);
let inflight = null;

export function useDrivers() {
  const loading = ref(false);
  const error = ref("");
  const items = ref(cache.value);

  const load = async () => {
    if (cache.value) {
      items.value = cache.value;
      return cache.value;
    }
    if (!inflight) {
      loading.value = true;
      inflight = fetchAvailableDrivers()
        .then((res) => {
          cache.value = res;
          items.value = res;
          return res;
        })
        .catch((e) => {
          error.value = String(e?.message || e);
          throw e;
        })
        .finally(() => {
          loading.value = false;
        });
    }
    return inflight;
  };

  return { items, loading, error, load };
}

