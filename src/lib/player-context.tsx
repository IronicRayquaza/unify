'use client';
import React, { createContext, useContext, ReactNode } from 'react';

const PlayerContext = createContext<any>(null);

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  return <PlayerContext.Provider value={{}}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => useContext(PlayerContext);