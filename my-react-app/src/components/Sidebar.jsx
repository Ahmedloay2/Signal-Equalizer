import React, { useState } from 'react';
import { Music, Dog, Users, Sliders, ChevronDown } from 'lucide-react';

export const Sidebar = ({ currentMode, currentSubMode, onModeChange }) => {
  const [expandedMode, setExpandedMode] = useState(null);

  const modes = [
    { 
      id: 'generic', 
      label: 'Generic', 
      icon: Sliders,
      subModes: [] 
    },
    { 
      id: 'music', 
      label: 'Music', 
      icon: Music,
      subModes: [
        { id: 'normal', label: 'Normal EQ' },
        { id: 'ai', label: 'AI Separation' }
      ]
    },
    { 
      id: 'animal', 
      label: 'Animal', 
      icon: Dog,
      subModes: []
    },
    { 
      id: 'human', 
      label: 'Human', 
      icon: Users,
      subModes: [
        { id: 'normal', label: 'Normal EQ' },
        { id: 'ai', label: 'AI Separation' }
      ]
    }
  ];

  const handleModeClick = (mode) => {
    if (mode.subModes.length > 0) {
      setExpandedMode(expandedMode === mode.id ? null : mode.id);
    } else {
      onModeChange(mode.id, undefined);
    }
  };

  const handleSubModeClick = (modeId, subModeId) => {
    onModeChange(modeId, subModeId);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Signal EQ</h2>
      </div>
      
      <nav className="sidebar-nav">
        {modes.map(mode => {
          const Icon = mode.icon;
          const isActive = currentMode === mode.id;
          const isExpanded = expandedMode === mode.id;
          const hasSubModes = mode.subModes.length > 0;

          return (
            <div key={mode.id} className="nav-item-container">
              <button
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleModeClick(mode)}
              >
                <Icon size={18} className="nav-icon" />
                <span className="nav-label">{mode.label}</span>
                {hasSubModes && (
                  <ChevronDown 
                    size={16} 
                    className={`nav-arrow ${isExpanded ? 'expanded' : ''}`}
                  />
                )}
              </button>

              {hasSubModes && isExpanded && (
                <div className="nav-submenu">
                  {mode.subModes.map(subMode => (
                    <button
                      key={subMode.id}
                      className={`nav-subitem ${
                        isActive && currentSubMode === subMode.id ? 'active' : ''
                      }`}
                      onClick={() => handleSubModeClick(mode.id, subMode.id)}
                    >
                      {subMode.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
};
