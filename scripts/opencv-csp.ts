import { createHash } from 'node:crypto'

// The pinned distribution uses the older Emscripten embind glue. Substitute
// ordinary closures for its generated functions and keep the OpenCV WASM unchanged.
const patchedGlue = [
  [
    'function createNamedFunction(',
    'function extendError(',
    `
function createNamedFunction(name,body){
  const invoke=function(...args){return body.apply(this,args)};
  return Object.defineProperty(invoke,"name",{value:makeLegalFunctionName(name)});
}
`,
  ],
  [
    'function makeDynCaller(',
    'var fp;if(Module["FUNCTION_TABLE_',
    `
function makeDynCaller(dynCall){return (...args)=>dynCall(rawFunction,...args)}
`,
  ],
  [
    'function craftInvokerFunction(',
    'function heap32VectorToArray(',
    `
function craftInvokerFunction(name,types,classType,invoker,target){
  if(types.length<2)throwBindingError("Invalid argument types for "+name);
  const isMethod=types[1]!==null&&classType!==null;
  const needsStack=types.slice(1).some(type=>type!==null&&type.destructorFunction===undefined);
  const first=isMethod?1:2;
  return createNamedFunction(name,function(...args){
    if(args.length!==types.length-2)throwBindingError("Invalid argument count for "+name);
    const stack=needsStack?[]:null;
    const wired=[];
    if(isMethod)wired.push(types[1].toWireType(stack,this));
    for(let i=0;i<args.length;i++)wired.push(types[i+2].toWireType(stack,args[i]));
    const result=invoker(target,...wired);
    if(stack)runDestructors(stack);
    else for(let i=first;i<types.length;i++){
      const destroy=types[i].destructorFunction;
      if(destroy!==null)destroy(wired[i-first]);
    }
    if(types[0].name!=="void")return types[0].fromWireType(result);
  });
}
`,
  ],
  [
    'function __emval_get_method_caller(',
    'function __emval_get_property(',
    `
function __emval_get_method_caller(argCount,argTypes){
  const types=__emval_lookupTypes(argCount,argTypes);
  const retType=types[0];
  return __emval_addMethodCaller(function(handle,name,destructors,offset){
    const args=types.slice(1).map(type=>{
      const value=type.readValueFromPointer(offset);
      offset+=type.argPackAdvance;
      return value;
    });
    const result=handle[name](...args);
    args.forEach((arg,i)=>types[i+1].deleteObject?.(arg));
    if(!retType.isVoid)return retType.toWireType(destructors,result);
  });
}
`,
  ],
] as const

export function adaptOpenCvGlue(original: string, expectedHash: string) {
  if (createHash('sha256').update(original).digest('hex') !== expectedHash)
    throw Error(
      'The OpenCV browser glue changed. Revalidate the CSP-compatible build.',
    )
  let build = original
  for (const [start, end, body] of patchedGlue) {
    const first = build.indexOf(start),
      last = build.indexOf(end, first + 1)
    if (first < 0 || last < 0)
      throw Error('Could not locate the pinned OpenCV browser glue.')
    build = build.slice(0, first) + body + build.slice(last)
  }
  if (/\bnew Function\s*\(|\bnew_\(Function|\beval\s*\(/.test(build))
    throw Error('Unpatched JavaScript evaluation in the OpenCV browser glue.')
  return build
}
