import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix the default Leaflet marker icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom pin component to update map view based on center
function MapViewUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

const MapView = ({ 
  center = [13.0827, 80.2707], // Default to Chennai
  zoom = 13, 
  markers = [], 
  radius = 0,
  onMapClick = null
}) => {
  return (
    <div className="map-view-container" style={{ height: '300px', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer 
        center={center} 
        zoom={zoom} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapViewUpdater center={center} />
        
        {radius > 0 && (
          <Circle 
            center={center} 
            pathOptions={{ fillColor: 'blue', color: 'blue' }} 
            radius={radius} 
          />
        )}
        
        {markers.map((marker, index) => (
          <Marker 
            key={index} 
            position={marker.position}
            icon={marker.icon}
          >
            {marker.popup && (
              <Popup>
                {marker.popup}
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapView;
