// double helix navigation node icon
// /**
//  * Integrated Circuit Navigation System
//  * Icons and tree branches share the same vertical axis and rotate together
//  */

// import React from "react";
// // import { NavigationNode } from "../hooks/useScrollNavigation";

// interface NavigationNodeIconProps {
//   label: string;
//   icon?: string;
// }

// export function NavigationNodeIcon({ label, icon }: NavigationNodeIconProps) {
//   return (
//     <div className="flex flex-col items-center gap-2 select-none">
//       <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg flex items-center justify-center border-2 border-white/20">
//         <div className="text-white">
//           {icon ? (
//             <div className="text-2xl">{icon}</div>
//           ) : (
//             <div className="text-xs uppercase tracking-wider">
//               {label.slice(0, 2)}
//             </div>
//           )}
//         </div>
//         <div className="absolute inset-0 rounded-full bg-white/20 blur-md -z-10" />
//       </div>
//       <span className="text-sm bg-black/60 text-white px-3 py-1 rounded-full whitespace-nowrap backdrop-blur-sm">
//         {label}
//       </span>
//     </div>
//   );
// }

/**
 * Integrated Circuit Navigation System
 * Icons and tree branches share the same vertical axis and rotate together
 */

import React from "react";
// import { NavigationNode } from "../hooks/useScrollNavigation";

interface NavigationNodeIconProps {
  label: string;
  icon?: string;
}

export function NavigationNodeIcon({ label, icon }: NavigationNodeIconProps) {
  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg flex items-center justify-center border-2 border-white/20">
        <div className="text-white">
          {icon ? (
            <div className="text-2xl">{icon}</div>
          ) : (
            <div className="text-xs uppercase tracking-wider">
              {label.slice(0, 2)}
            </div>
          )}
        </div>
        <div className="absolute inset-0 rounded-full bg-white/20 blur-md -z-10" />
      </div>
      <span className="text-sm bg-black/60 text-white px-3 py-1 rounded-full whitespace-nowrap backdrop-blur-sm">
        {label}
      </span>
    </div>
  );
}
