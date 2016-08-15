package com.classes;

/**
 * Created by Austen on 15/08/2016.
 */
public class ShoppingListItem extends BaseItem {
    private Long ingredientId;
    private int quantity;
    private boolean purchased = false;

    public Long getIngredientId(){
        return ingredientId;
    }

    public void setIngredientId(Long ingredientId){
        this.ingredientId = ingredientId;
    }

    public int getQuantity(){
        return quantity;
    }

    public void setQuantity(int quantity){
        this.quantity = quantity;
    }

    public boolean getPurchased(){
        return purchased;
    }

    public void setPurchased(int purchased){
        if (purchased == 0){
            this.purchased = false;
        }
        else{
            this.purchased = true;
        }
    }
}
