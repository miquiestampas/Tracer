import React, { useEffect, useState } from 'react';
import apiClient from '../services/api';
import { createSavedSearch, getSavedSearches, updateSavedSearch, deleteSavedSearch } from '../services/savedSearchesApi';

const handleSaveSearch = async () => {
  if (!searchName.trim()) {
    setError('Por favor, introduce un nombre para la búsqueda');
    return;
  }

  try {
    const savedSearch = await createSavedSearch(casoId, {
      name: searchName,
      caso_id: casoId,
      filters: {
        fechaInicio: filters.fechaInicio,
        fechaFin: filters.fechaFin,
        timeFrom: filters.timeFrom,
        timeTo: filters.timeTo,
        selectedLectores: filters.selectedLectores,
        selectedCarreteras: filters.selectedCarreteras,
        selectedSentidos: filters.selectedSentidos,
        matricula: filters.matricula,
        minPasos: filters.minPasos,
        maxPasos: filters.maxPasos
      },
      results: lecturas
    });

    setSavedSearches(prev => [...prev, savedSearch]);
    setSearchName('');
    setShowSaveDialog(false);
    setError(null);
  } catch (error) {
    console.error('Error al guardar la búsqueda:', error);
    setError('Error al guardar la búsqueda. Por favor, inténtalo de nuevo.');
  }
};

const handleLoadSearch = async (searchId) => {
  try {
    const searches = await getSavedSearches(casoId);
    const selectedSearch = searches.find(s => s.id === searchId);
    if (selectedSearch) {
      setFilters(selectedSearch.filters);
      setLecturas(selectedSearch.results);
      setShowLoadDialog(false);
    }
  } catch (error) {
    console.error('Error al cargar la búsqueda:', error);
    setError('Error al cargar la búsqueda. Por favor, inténtalo de nuevo.');
  }
};

const handleDeleteSearch = async (searchId) => {
  try {
    await deleteSavedSearch(searchId);
    setSavedSearches(prev => prev.filter(search => search.id !== searchId));
  } catch (error) {
    console.error('Error al eliminar la búsqueda:', error);
    setError('Error al eliminar la búsqueda. Por favor, inténtalo de nuevo.');
  }
};

// Cargar búsquedas guardadas al inicio
useEffect(() => {
  const fetchSavedSearches = async () => {
    try {
      const searches = await getSavedSearches(casoId);
      setSavedSearches(searches);
    } catch (error) {
      console.error('Error al cargar las búsquedas guardadas:', error);
      setError('Error al cargar las búsquedas guardadas');
    }
  };

  if (casoId) {
    fetchSavedSearches();
  }
}, [casoId]); 