'use client';
import React, { createContext, useContext, ReactNode } from 'react';

const PlaylistContext = createContext<any>(null);

export const PlaylistProvider = ({ children }: { children: ReactNode }) => {
  return <PlaylistContext.Provider value={{}}>{children}</PlaylistContext.Provider>;
};

export const usePlaylist = () => useContext(PlaylistContext);