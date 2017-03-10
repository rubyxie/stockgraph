/**
 * Created by yuhk18757 on 2017/3/10.
 */
(function(){
    var stockCode;
    var bindTrigger,bindSearch,beginPage;

    bindTrigger=function(){
        var buttons,showType,i,l;
        stockCode="600570.SS";
        showType=["分时","五日","1分钟","5分钟","15分钟","30分钟","60分钟","日K","周K","月K","年K"];
        buttons=document.querySelectorAll(".button-wrap button");
        for(i=0,l=showType.length;i<l;i++)(function(index){
            buttons[index].addEventListener("click",function(){
                StockGraph.draw(showType[index],stockCode);
            });
        })(i);
    };

    bindSearch=function(){
        var input,search;
        input=document.querySelector("input");
        search=document.querySelector(".search");
        search.addEventListener("click",function(){
            stockCode=input.value;
            StockGraph.draw("日K",stockCode);
        });
    };

    beginPage=function(){
        bindTrigger();
        bindSearch();
        StockGraph.draw("日K",stockCode);
    };

    Util.ready(beginPage);
})();