import { runLuaStaticAnalysisSelftest } from '../src/lib/luaStaticAnalysis';
import { runProjectValidationSelftest } from '../src/server/projectValidation';
const results = {lua:runLuaStaticAnalysisSelftest(),project:runProjectValidationSelftest()};
console.log(JSON.stringify(results,null,2));
if(!results.lua.pass || !results.project.pass) process.exitCode=1;
