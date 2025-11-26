import React from 'react';
import { useTranslation } from 'react-i18next';
import './MultiPersonWarning.css';

interface MultiPersonWarningProps {
  show: boolean;
  isRecording: boolean;
}

export const MultiPersonWarning: React.FC<MultiPersonWarningProps> = ({ show, isRecording }) => {
  const { t } = useTranslation();
  
  if (!show) {
    return null;
  }

  return (
    <div className="multi-person-warning">
      <div className="warning-icon">⚠️</div>
      <div className="warning-text">
        {isRecording ? (
          <>
            <div className="warning-title">{t('multiPerson.detected')}</div>
            <div className="warning-subtitle">{t('multiPerson.trackingOriginal')}</div>
          </>
        ) : (
          <>
            <div className="warning-title">{t('multiPerson.detected')}</div>
            <div className="warning-subtitle">{t('multiPerson.trackingCenter')}</div>
          </>
        )}
      </div>
    </div>
  );
};
