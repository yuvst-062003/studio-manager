// The tools M0.4 builds, registered into the 'dev-bar' slot at module load. M5 and
// M6/M8 add their own file beside this one; neither this file nor DevBar.tsx is
// reopened to accept them.
import { IpnSimulatorTool } from './IpnSimulatorTool'
import { TimeTravelTool } from './TimeTravelTool'
import { registerDevTool } from './tools'

registerDevTool('timeTravel', TimeTravelTool)
registerDevTool('simulateIpn', IpnSimulatorTool)
