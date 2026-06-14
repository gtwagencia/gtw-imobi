const SCRIPT_ID = 'google-maps-script';

export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export function isGoogleMapsConfigured(): boolean {
  return !!GOOGLE_MAPS_API_KEY;
}

let loadPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps só pode ser carregado no navegador'));
  }
  if (window.google?.maps) return Promise.resolve(window.google);
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY não configurada'));
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google));
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar Google Maps')));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&language=pt-BR&region=BR`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Falha ao carregar Google Maps'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
