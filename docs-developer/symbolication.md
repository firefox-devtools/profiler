# Symbolication

Symbolication is the act of translating a memory address into a symbol name or function name.

## Some background on how native code runs on the CPU in a process

When you compile and link some C++ code, the compiler creates a binary, which is either a static executable or a dynamic library. If you run a program, you start an operating process from such a static executable. A process has access to some memory. On startup, this memory only contains the exact data from the executable file itself and is otherwise empty. The code from the executable starts running because something causes the CPU to jump to the address at which the main() function's code is stored in memory.

On startup, the main executable will usually load other dynamic libraries into its memory, so that it can run code from them as necessary. The files for these libraries, which were produced by the compiler, get mapped into the process's memory 1:1. They occupy certain address ranges in the process's virtual address space. Running a function from a library works like this: First, something figures out the address in memory where the code of the function that you want to run is stored. Then you make the CPU jump to that address, with a "call" or a "jump" instruction.

The virtual address space of a process contains many different types of data. An "address" in this space can be the address of some code, or of a value on the heap, or of a value on the stack of one of the threads that are currently running in the process.

When the profiler collects stacks, what it really collects are "addresses of code in memory". It gets these addresses from two places: The instruction pointer and the stack. The "program counter" or "instruction pointer" is a CPU register that contains the address of the code that is currently executing. The profiler uses this to get the topmost "call stack frame".

Once the current function returns, the CPU will return to the caller's code. It knows where the caller's code is because the address of that code has been stored on the stack of this thread: For example, a "call" instruction automatically pushes the current instruction pointer to the stack before it jumps to the destination address, and a "return" instruction pops that value from the stack and jumps to it.

So the profiler gets the rest of the call stack frames by finding addresses to code on the stack. It has some help when finding the right parts of the stack to look for these values, but I'm not going into the exact mechanisms here. This is all to say that call stacks in a profile contain addresses which are meaningful within the process's virtual address space.

In order to translate these addresses into symbols, a few things need to happen:

1.  For each address, identify the binary that occupies that area of memory, if any.
2.  Translate the address into a binary-relative offset, by subtracting the address in memory where the mapping of the binary starts.
3.  Consult a symbol table which maps binary-relative offsets to strings.

## Where symbol tables come from

There are fundamentally two classes of binaries that we need to symbolicate:

- Binaries we create ourselves, by compiling our own code
- Existing binaries from other sources, most notably system libraries from the operating system that we run on

For binaries that we create ourselves, the compiler automatically creates symbol information and debug information. On Linux and macOS, the symbol information is embedded in the resulting binary itself, and on Windows, it is stored in a separate .pdb file.

For our official builds, the build machines take this debug information and turn it into breakpad symbol files.
Breakpad symbol files are plain text files which contain the mapping of binary-relative offset to function name for all functions in the binary, and they also contain some other stuff.
The breakpad symbol files are automatically pushed to the Mozilla symbol server.

The following is an example breakpad entry for a function symbol. More information can be found at the [breakpad documentation on symbol files.](https://chromium.googlesource.com/breakpad/breakpad/+/master/docs/symbol_files.md)

```
FUNC c184 30 0 nsQueryInterfaceWithError::operator()(nsID const&, void**) const
```

| Text | Explanation                                                            |
| ---- | ---------------------------------------------------------------------- |
| FUNC | Indicates that this is a function record.                              |
| c184 | The hexadecimal memory location relative to the module's load address. |
| 30   | The hexadecimal length of bytes in the function.                       |
| 0    | The hexadecimal length of bytes of the size of the parameters.         |
| ...  | The remaining `nsQueryInterfaceWithError` text is the actual symbol.   |

A binary is identified by its debugName and by an identifier. The identifier is its breakpadId, which is a string of 33 hex characters.

The Mozilla symbol server makes symbol information from the breakpad symbol files available in two forms:

1.  It serves the raw breakpad symbol files at `https://symbols.mozilla.org/debugName/breakpadId/debugName.sym`, for example at [https://symbols.mozilla.org/firefox/5147A2EC44F038CCB9DE2D0AC50A15E30/firefox.sym](https://symbols.mozilla.org/firefox/5147A2EC44F038CCB9DE2D0AC50A15E30/firefox.sym).
2.  It has a [publicly accessible API to obtain symbol information for only certain addresses](https://tecken.readthedocs.io/en/latest/symbolication.html).

These breakpad symbol files are also used for symbolicating crash reports.

Breakpad is the name of the crash reporting system that Firefox uses.

Windows system libraries do not contain symbol information in the binary file, and Windows does not ship with pdb files for any system libraries. Instead, [Microsoft has a symbol server](<https://msdn.microsoft.com/en-us/library/windows/desktop/ee416588(v=vs.85).aspx#symbol_servers>) that provides the pdb files (?) for all their system libraries.
The Mozilla symbol server is somehow connected to the Microsoft symbol server, and automatically creates breakpad symbol files for all the libraries that Microsoft's symbol server provides symbol information for.

On macOS, system libraries contain symbol information in the binary files. It can be extracted using command line tools like `nm`.

On Linux, system libraries sometimes contain symbol information and sometimes not. Sometimes you can replace symbol-less system libraries with their equivalent symbol-ful forms by installing a `<libraryname>-debug` package.

The Mozilla symbol server has breakpad symbol files for some macOS system libraries, but not for all of them or not all versions of them. I don't know if there are any breakpad symbol files for Linux system libraries on the Mozilla symbol server.

The utility that the build process uses to create breakpad symbol files is called "dump_syms". It's produced as part of the build process. You can run it for local builds using the command "mach buildsymbols".

For local Firefox builds, symbol information can be extracted the following ways:

- On Windows, you can extract it from the pdb file that the compiler produced for that library. The easiest way to do that is to run dump_syms on the pdb file.

- On macOS and Linux, you can run dump_syms on the binary itself. Or you can run "nm" on the binary itself.

## How the profiler does symbolication

When [profiler.firefox.com] receives the profile from the gecko profiler add-on, it is unsymbolicated. It does however, include the library information and memory offsets. The method for gathering this information is platform specific, and the Gecko Profiler handles it differently on [Linux](https://searchfox.org/mozilla-central/rev/b80994a43e5d92c2f79160ece176127eed85dcc9/tools/profiler/core/shared-libraries-linux.cc), [macOS](https://searchfox.org/mozilla-central/rev/b80994a43e5d92c2f79160ece176127eed85dcc9/tools/profiler/core/shared-libraries-macos.cc), and [Windows](https://searchfox.org/mozilla-central/rev/b80994a43e5d92c2f79160ece176127eed85dcc9/tools/profiler/core/shared-libraries-win32.cc).

[profiler.firefox.com] has an IndexedDB table which contains full symbol tables for some libraries. (This table starts out empty.)

Then, the following things happen:

1.  [profiler.firefox.com] iterates over all addresses in the profile's call stacks, finds which binary they came from by comparing them to the library information stored in the profile, and converts them into binary-relative offsets.

2.  [profiler.firefox.com] checks for which of these libraries it has cached symbol tables in IndexedDB.
    1. For libraries with cached symbol tables, it uses those symbol tables to map the addresses to symbols.

3.  For all other libraries, it requests symbols for the collected addresses using the Mozilla symbolication API. The results of this are _not_ cached.
    1. The Mozilla symbolication API will be able to symbolicate any libraries for which there exist breakpad symbol files on the Mozilla symbol server, so: official Firefox builds, most of Windows system libraries, some macOS system libraries.

4.  For any libraries which the Mozilla symbolication API was not able to find symbols, [profiler.firefox.com] requests a symbol table from the add-on, which will forward the request to the geckoProfiler WebExtension API.
    1.  The WebExtension API will try multiple methods to obtain symbol information. The code for this is at https://searchfox.org/mozilla-central/rev/7e663b9fa578d425684ce2560e5fa2464f504b34/browser/components/extensions/ext-geckoProfiler.js#409-473 .
        1. First, it will try to find a breakpad symbol file for the library in the objdir, if the Firefox build that is being symbolicated is a local build. These symbol files only exist if the user has run "mach buildsymbols" after compiling.

        2. Next, it will request a raw breakpad symbol file for the library from the Mozilla symbol server. This will never succeed, usually, because if the Mozilla symbol server had information about this library, the Mozilla symbolication API would already have found it. We should probably remove this step.

        3. On Linux and macOS, it will now try to run "nm" on the library.

        4. On Windows, if this is a local build, it'll try to find "dump_syms.exe" in the objdir and run it on the pdb file.

5.  Symbol tables that were obtained in step 4 are sent to [profiler.firefox.com] and the page caches them in the IndexedDB table. The relevant addresses are symbolicated using the symbol table.

6.  Libraries for which no symbol information could be obtained stay unsymbolicated.

[profiler.firefox.com]: https://profiler.firefox.com
