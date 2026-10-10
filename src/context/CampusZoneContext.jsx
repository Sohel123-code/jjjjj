import { createContext, useContext, useState } from 'react';

const CampusZoneContext = createContext(null);
export function CampusZoneProvider({ children }) {
  // An explicit local campus preview. No coordinates go to persistent storage.
  // Replace this draft with an approved server-owned zone for real memberships.
  const [campusZone, setCampusZone] = useState(null);
  return <CampusZoneContext.Provider value={{ campusZone, setCampusZone }}>{children}</CampusZoneContext.Provider>;
}
export const useCampusZone = () => useContext(CampusZoneContext);
