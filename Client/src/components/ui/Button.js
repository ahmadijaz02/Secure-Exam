import React from 'react';
import LoadingSpinner from './LoadingSpinner';

function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  type = 'button',
  className = '',
  onClick,
  ...props
}) {
  const baseClasses = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]';

  const variantClasses = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500 shadow-sm',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 shadow-sm shadow-emerald-500/20',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500 shadow-sm shadow-amber-500/20',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-sm shadow-red-500/20',
    outline: 'border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800 focus:ring-gray-500',
    'outline-primary': 'border-2 border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-transparent hover:bg-indigo-50 dark:hover:bg-indigo-950/30 focus:ring-indigo-500',
    ghost: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:ring-gray-500',
    link: 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 underline-offset-4 hover:underline focus:ring-indigo-500',
    'gradient-primary': 'text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 focus:ring-indigo-500 shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30',
    'gradient-danger': 'text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 focus:ring-red-500 shadow-md shadow-red-500/20 hover:shadow-lg hover:shadow-red-500/30',
    'gradient-success': 'text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 focus:ring-emerald-500 shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
    xl: 'px-8 py-4 text-lg',
  };

  const classes = `${baseClasses} ${variantClasses[variant] || variantClasses.primary} ${sizeClasses[size]} ${className}`;

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      onClick={onClick}
      {...props}
    >
      {loading && (
        <LoadingSpinner 
          size="sm" 
          color={variant.includes('outline') || variant === 'ghost' || variant === 'link' ? 'indigo' : 'white'} 
          className="mr-2" 
        />
      )}
      {children}
    </button>
  );
}

export default Button;
