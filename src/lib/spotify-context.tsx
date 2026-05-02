'use client';
import React, { createContext, useContext, ReactNode } from 'react';

const SpotifyContext = createContext<any>(null);

export const SpotifyProvider = ({ children }: { children: ReactNode }) => {
  return <SpotifyContext.Provider value={{}}>{children}</SpotifyContext.Provider>;
};

export const useSpotify = () => useContext(SpotifyContext);