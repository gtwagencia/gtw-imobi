'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { loadGoogleMaps, isGoogleMapsConfigured } from '@/lib/googleMaps';

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  /** Endereço completo usado para localizar o ponto no mapa */
  address?: string;
  onChange: (lat: number | null, lng: number | null) => void;
}

const DEFAULT_CENTER = { lat: -23.5505, lng: -46.6333 }; // São Paulo

export default function LocationPicker({ latitude, longitude, address, onChange }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerInstance = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [available, setAvailable] = useState(isGoogleMapsConfigured());
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!available || !mapRef.current || mapInstance.current) return;

    loadGoogleMaps()
      .then((g) => {
        if (!mapRef.current) return;
        const center = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : DEFAULT_CENTER;
        const map = new g.maps.Map(mapRef.current, {
          center, zoom: latitude != null ? 16 : 12,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        });
        const marker = new g.maps.Marker({ position: center, map, draggable: true });

        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) onChangeRef.current(pos.lat(), pos.lng());
        });
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          marker.setPosition(e.latLng);
          onChangeRef.current(e.latLng.lat(), e.latLng.lng());
        });

        mapInstance.current = map;
        markerInstance.current = marker;
        geocoderRef.current = new g.maps.Geocoder();
      })
      .catch((err) => { setError(err.message); setAvailable(false); });
  }, [available, latitude, longitude]);

  // Sincroniza marcador/mapa quando lat/lng mudam externamente (ex: busca por endereço)
  useEffect(() => {
    if (!mapInstance.current || !markerInstance.current) return;
    if (latitude == null || longitude == null) return;
    const pos = { lat: latitude, lng: longitude };
    markerInstance.current.setPosition(pos);
    mapInstance.current.setCenter(pos);
    mapInstance.current.setZoom(16);
  }, [latitude, longitude]);

  async function handleGeocodeAddress() {
    if (!geocoderRef.current || !address?.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const result = await geocoderRef.current.geocode({ address });
      const loc = result.results[0]?.geometry?.location;
      if (!loc) { setError('Endereço não encontrado'); return; }
      onChange(loc.lat(), loc.lng());
    } catch {
      setError('Erro ao buscar endereço no mapa');
    } finally {
      setSearching(false);
    }
  }

  if (!available) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
          <input
            className="input" type="number" step="0.000001"
            value={latitude ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value), longitude)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
          <input
            className="input" type="number" step="0.000001"
            value={longitude ?? ''}
            onChange={e => onChange(latitude, e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <p className="col-span-2 text-xs text-gray-400">
          Mapa indisponível: configure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para selecionar a localização visualmente no mapa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={handleGeocodeAddress}
          disabled={searching || !address?.trim()}
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Localizar endereço no mapa
        </button>
        {latitude != null && longitude != null && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div ref={mapRef} className="w-full h-64 rounded-xl border border-gray-200 bg-gray-100" />
      <p className="text-xs text-gray-400">Clique no mapa ou arraste o marcador para ajustar o ponto exato do imóvel.</p>
    </div>
  );
}
