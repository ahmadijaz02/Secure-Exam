import React from 'react';
import Button from './Button';

function ConfirmationModal({ 
  isOpen, 
  title = 'Confirm Action', 
  message = 'Are you sure?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDangerous = false,
  isLoading = false
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/60 dark:border-slate-700/40 p-6 w-full max-w-sm animate-scale-in">
        {/* Icon */}
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
          isDangerous 
            ? 'bg-red-100 dark:bg-red-900/30' 
            : 'bg-amber-100 dark:bg-amber-900/30'
        }`}>
          <svg 
            className={`w-6 h-6 ${
              isDangerous 
                ? 'text-red-600 dark:text-red-400' 
                : 'text-amber-600 dark:text-amber-400'
            }`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d={isDangerous 
                ? "M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                : "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              } 
            />
          </svg>
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          {title}
        </h2>

        {/* Message */}
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {message}
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1"
          >
            {cancelText}
          </Button>
          <Button
            variant={isDangerous ? "danger" : "gradient-primary"}
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Please wait...
              </>
            ) : (
              confirmText
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmationModal;
