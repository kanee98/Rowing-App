import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TourDefinition, TourStep, OnboardingProgress } from '../types';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import confetti from 'canvas-confetti';

interface TourContextType {
  availableTours: TourDefinition[];
  activeTour: TourDefinition | null;
  currentStepIndex: number;
  currentStep: TourStep | null;
  isActive: boolean;
  progressList: OnboardingProgress[];
  startTour: (tourId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  endTour: (completed?: boolean) => void;
  isTourCompleted: (tourId: string) => boolean;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export const TourProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [availableTours, setAvailableTours] = useState<TourDefinition[]>([]);
  const [progressList, setProgressList] = useState<OnboardingProgress[]>([]);
  const [activeTour, setActiveTour] = useState<TourDefinition | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);

  const loadToursAndProgress = async () => {
    if (!user) return;
    try {
      const [tours, prog] = await Promise.all([
        api.getTours(),
        api.getOnboardingProgress()
      ]);
      setAvailableTours(tours);
      setProgressList(prog);
    } catch (err) {
      console.warn('Failed to load tours:', err);
    }
  };

  useEffect(() => {
    if (user) {
      loadToursAndProgress();
    }
  }, [user]);

  const startTour = (tourId: string) => {
    const tour = availableTours.find(t => t.tour_id === tourId);
    if (!tour || tour.steps.length === 0) return;
    setActiveTour(tour);
    setCurrentStepIndex(0);
    setIsActive(true);

    // Scroll to first step target if in DOM
    setTimeout(() => {
      const el = document.querySelector(tour.steps[0].target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };

  const nextStep = () => {
    if (!activeTour) return;
    if (currentStepIndex < activeTour.steps.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      setTimeout(() => {
        const el = document.querySelector(activeTour.steps[nextIdx].target);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    } else {
      endTour(true);
    }
  };

  const prevStep = () => {
    if (!activeTour) return;
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      setTimeout(() => {
        const el = document.querySelector(activeTour.steps[prevIdx].target);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  };

  const endTour = async (completed = false) => {
    if (activeTour) {
      if (completed) {
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        } catch (e) {
          // ignore confetti errors
        }
      }

      try {
        await api.updateTourProgress({
          tour_id: activeTour.tour_id,
          current_step: currentStepIndex,
          is_completed: completed,
          dismissed: !completed
        });
        loadToursAndProgress();
      } catch (err) {
        console.warn('Failed to save tour progress:', err);
      }
    }
    setIsActive(false);
    setActiveTour(null);
    setCurrentStepIndex(0);
  };

  const isTourCompleted = (tourId: string): boolean => {
    const prog = progressList.find(p => p.tour_id === tourId);
    return prog ? prog.is_completed : false;
  };

  const currentStep = activeTour && activeTour.steps[currentStepIndex] ? activeTour.steps[currentStepIndex] : null;

  return (
    <TourContext.Provider value={{
      availableTours,
      activeTour,
      currentStepIndex,
      currentStep,
      isActive,
      progressList,
      startTour,
      nextStep,
      prevStep,
      endTour,
      isTourCompleted
    }}>
      {children}
    </TourContext.Provider>
  );
};

export const useTour = () => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
};
